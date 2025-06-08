import axios from 'axios';
import querystring from 'querystring';
import dotenv from 'dotenv';

dotenv.config();

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;

const getAuthToken = async () => {
    const params = {
        grant_type: 'client_credentials',
        client_id: FATSECRET_CLIENT_ID,
        client_secret: FATSECRET_CLIENT_SECRET,
    };

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    try {
        const response = await axios.post('https://oauth.fatsecret.com/connect/token', querystring.stringify(params), { headers });
        console.log('FatSecret API response:', response.data); // <-- logare răspuns complet
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching FatSecret API token:', error);
        throw error;
    }
};

// Dacă ai o funcție separată pentru search:
const searchFood = async (query) => {
    const token = await getAuthToken();

    const searchResponse = await axios.get(`https://platform.fatsecret.com/rest/server.api`, {
        params: {
            method: 'foods.search',
            search_expression: query,
            format: 'json',
        },
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    console.log('FatSecret API search response:', searchResponse.data); // <-- logare răspuns complet pentru search
    return searchResponse.data;
};

export { getAuthToken, searchFood };