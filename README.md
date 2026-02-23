# Thais MCP Server

Production-style Model Context Protocol (MCP) server for the Thais Hotel API.

This server exposes booking-related tools to an MCP client (including Claude through an MCP-compatible connection), so Claude can:

- check room availability by date range
- list room type IDs with human-readable names

## Features

- MCP server built with `@modelcontextprotocol/sdk`
- HTTP transport (`/mcp`) with session lifecycle handling
- Express API server for MCP request routing
- Zod schema validation for tool inputs
- Secure login flow via bearer token
- Structured error responses for client-safe failures

## Project Structure

```
src/
├── index.js          # MCP server creation, tool registration, and HTTP endpoints
├── helpers.js        # Thais API authentication + data-access helpers
package.json          # dependencies and package metadata
.env.example          # example environment variables template
README.md             # this file
```

## Requirements

- Node.js 18+
- npm
- Thais API credentials (`USERNAME`, `PASSWORD`)

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
USERNAME=your_thais_username
PASSWORD=your_thais_password
```

## Run the Server

```bash
node src/index.js
```

Server URL:

```text
http://127.0.0.1:3000/mcp
```

---

## Function Reference

### `src/helpers.js`

#### `getTokens()`

Authenticates to Thais Partner API using `USERNAME` and `PASSWORD`, then returns a bearer token.

- Method: `POST /login`
- Returns: `token` (string)
- Throws: error if authentication fails

#### `thais_check_availability(checkIn_date, checkOut_date, token)`

Fetches current room availability between two dates.

- Method: `GET /hotel/apr/availabilities/currents?from=...&to=...`
- Inputs:
	- `checkIn_date` (`YYYY-MM-DD`)
	- `checkOut_date` (`YYYY-MM-DD`)
	- `token` (bearer token)
- Returns: availability array from Thais API
- Throws: error if API call fails

#### `thais_check_room_type(token)`

Fetches room type catalog (ID + label).

- Method: `GET /hotel/room-types`
- Input: `token`
- Returns: room type array
- Throws: error if API call fails

### `src/index.js`

#### `createMcpServer()`

Creates and configures a new MCP server instance (`thais_mcp_server` v`1.0.0`) and registers tools.

Registered MCP tools:

1. `get_room_availability`
	 - Purpose: check availability between `from` and `to`
	 - Input schema:
		 - `from`: date string in `YYYY-MM-DD`
		 - `to`: date string in `YYYY-MM-DD`
	 - Behavior:
		 - gets token via `getTokens()`
		 - fetches availability via `thais_check_availability()`
		 - filters results to rooms with `availability > 0`
		 - returns user-readable summary text
	 - Failure handling: returns friendly MCP text error

2. `thais_list_room_types`
	 - Purpose: map room type IDs to labels
	 - Behavior:
		 - gets token via `getTokens()`
		 - fetches room types via `thais_check_room_type()`
		 - returns readable `Type ID = Label` text
	 - Failure handling: returns friendly MCP text error

#### HTTP Session & Transport Logic

- `POST /mcp`
	- Reuses an existing session when header `mcp-session-id` is valid
	- Creates a new session on initialize request (`isInitializeRequest`)
	- Binds a `StreamableHTTPServerTransport` to a server instance
	- Returns JSON-RPC errors on invalid requests

- `GET /mcp`
	- Handles streaming requests for valid sessions

- `DELETE /mcp`
	- Terminates session and removes transport from memory

---

## Connect This MCP to Claude

There are two common ways to connect, depending on your Claude MCP client capabilities.

### Option A: Claude client supports Streamable HTTP MCP directly

If your Claude MCP client allows remote MCP URLs, add this server endpoint:

```text
http://127.0.0.1:3000/mcp
```

Then:

1. start this server (`node src/index.js`)
2. add the MCP server URL in Claude
3. verify Claude can discover tools:
	 - `get_room_availability`
	 - `thais_list_room_types`

### Option B: Claude Desktop (stdio) using an HTTP bridge

If your Claude app expects `stdio` MCP servers only, use an HTTP-to-stdio bridge such as `mcp-remote`.

1. Keep this server running:

```bash
node src/index.js
```

2. Edit Claude Desktop MCP config (example):

```json
{
	"mcpServers": {
		"thais": {
			"command": "npx",
			"args": [
				"-y",
				"mcp-remote",
				"http://127.0.0.1:3000/mcp"
			]
		}
	}
}
```

3. Restart Claude Desktop.

4. In Claude, check that tools appear and run a test prompt:

```text
Check room availability from 2026-03-10 to 2026-03-15 and list room types.
```

> Note: Claude MCP features evolve. If your current Claude build already supports remote MCP URLs, Option A is simpler.

---

## API Behavior Notes

- Date format is strict: `YYYY-MM-DD`
- Availability output only includes room types with availability > 0
- Credentials are read at runtime from environment variables
- Sessions are stored in-memory (suitable for local/single-instance usage)

## Troubleshooting

- **401 / login failure**: verify `USERNAME` and `PASSWORD` in `.env`
- **Tool not visible in Claude**: restart Claude after MCP config changes
- **No availability data**: verify date range and upstream Thais data
- **Connection error**: confirm server is running on `127.0.0.1:3000`

## Security Recommendations

- never commit `.env`
- use dedicated API credentials for MCP integrations
- rotate credentials periodically

## License

ISC
