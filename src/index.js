import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  getTokens,
  thais_check_availability,
  thais_check_room_type
} from "./helpers.js";


const app = express();
app.use(express.json());

// store active transports keyed by session id
const transports = {};
// port server
const PORT = 3000 || process.env.PORT;

// Function to create a new MCP server instance
function createMcpServer() {
    const server = new McpServer({ 
        name: 'thais_mcp_server', 
        version: '1.0.0' 
    });
 // tool: check room availability for a date range
    server.registerTool(
        'get_room_availability',
        {
            description: 'Check if rooms are available at the hostel for specific dates',
            inputSchema: z.object({
                from: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)    // validate YYYY-MM-DD format
                    .describe("Check-in date in YYYY-MM-DD format (e.g , '2025-03-15')"),
                to: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/)    // validate YYYY-MM-DD format
                    .describe("Check-out date in YYYY-MM-DD format (e.g., '2025-03-25')")
            })
        },
        async ({ from, to }) => {
            try {
                const token = await getTokens();                               // authenticate and get API token
                const rooms_data = await thais_check_availability(from, to, token);
              
                
                if (!rooms_data || !Array.isArray(rooms_data) || rooms_data.length === 0) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: "No availability data found for these dates." 
                        }]
                    };
                }
                
                const availableRooms = rooms_data.filter(r => r.availability > 0);
                
                if (availableRooms.length === 0) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: "Sorry, there is no availability for the requested dates." 
                        }]
                    };
                }
                
                const summary = availableRooms.map(r => 
                    `- Room Type ID ${r.room_type_id}: ${r.availability} rooms left (ID: ${r.id})`
                ).join("\n");
                
                return {
                    content: [{
                        type: "text",
                        text: `Availability found from ${from} to ${to}:\n${summary}`
                    }]
                };
            } catch (error) {
                console.error("Tool Error:", error);
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error connecting to Thais API: ${error.message}` 
                    }]
                };
            }
        }
    );
 // tool: list all room types with their IDs and human-readable labels
    server.registerTool('thais_list_room_types' , {
            description: 'Lookup tool to convert room_type_ids into human-readable names (e.g., discovering that ID 5 is a "Deluxe Suite"). Call this if you see IDs but don\'t know the room names.',
    },
        async()=>{
            try{
                const token = await getTokens();
                const roomsType = await thais_check_room_type(token);
                const filtred_rooms_type = roomsType.map((room)=>(
                ` Type ID ${room.id} = ${room.label}`
                )).join("/n");

                return {
                    content : [{
                        type : 'text' ,
                        text : `Room type by id ${filtred_rooms_type}` 

                    }]
                }
            }
            catch(error){
                console.error("Tool Error:", error) ;
                return{
                    content:[{
                        type : "text" ,
                        text : `Error connecting to Thais API: ${error.message}` 
                    }]
                }
            }
        }
)
    return server;
}

// Handle POST requests for client/server communication
app.post('/mcp', async (req, res) => {
    try {
         // read session id from request header
        const sessionId = req.headers['mcp-session-id']; 
        let transport;

        if (sessionId && transports[sessionId]) {
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {

            // new initialization request
             // generate unique session id
            const newSessionId = randomUUID(); 

              // bind session id to transport
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId     
            });
              // create fresh MCP server instance
            const server = createMcpServer();
             // connect server to transport
            await server.connect(transport);
                // store transport for future requests
            transports[newSessionId] = transport;
            console.log(`Created new session: ${newSessionId}`);
        } else {
            // reject requests with invalid or missing session
            return res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid Request: Missing or invalid session ID'
                },
                id: null
            });
        }

        // Handle the request through the  transport
        await transport.handleRequest(req, res, req.body);
        
    } catch (error) {
        console.error('MCP endpoint error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

// GET /mcp — SSE streaming endpoint for server-to-client push messages
app.get('/mcp', async (req, res) => {
    try {
         // read session id from header
        const sessionId = req.headers['mcp-session-id'];
        
          // reject unknown sessions
        if (!sessionId || !transports[sessionId]) {
            return res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid Request: Missing or invalid session ID'
                },
                id: null
            });
        }

        const transport = transports[sessionId];
        // open SSE stream for this session
        await transport.handleRequest(req, res);
        
    } catch (error) {
        console.error('SSE endpoint error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

// DELETE /mcp — terminate and clean up an existing session
app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    
    if (sessionId && transports[sessionId]) {
          // remove transport to free memory
        delete transports[sessionId];
        console.log(`Terminated session : ${sessionId}`);
    }
    
    res.status(200).send();
});

// start HTTP server and bind to localhost only
app.listen(PORT, "127.0.0.1", () => {
    console.log(`Hostel MCP is live at http://127.0.0.1:${PORT}/mcp`);
    console.log(`Ready to accept connections `);
});