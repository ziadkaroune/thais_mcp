import 'dotenv/config'


const BASE_URL = 'https://demo.thais-hotel.com/hub/api/partner';
const username  = process.env.USERNAME;
const password = process.env.PASSWORD;


/// access token
export async function getTokens() {
    const response = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
        throw new Error("Can't get access token");
    }
    
    const data = await response.json();
    return data.token;
}



export   async function thais_check_availability(checkIn_date, checkOut_date, token) {
    const response = await fetch(`${BASE_URL}/hotel/apr/availabilities/currents?from=${checkIn_date}&to=${checkOut_date}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error("Can't get room availability");
    }
    
    return await response.json();
}

export  async function thais_check_room_type(token) {
    const response = await fetch(`${BASE_URL}/hotel/room-types`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error("Can't get room availability");
    }
    
    return await response.json();


}