import axios from 'axios';
import querystring from 'querystring';
import dotenv from 'dotenv';

dotenv.config();

const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;

// Alertă imediată dacă lipsesc cheile din env
if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.error("❌ FATSECRET_CLIENT_ID sau FATSECRET_CLIENT_SECRET lipsesc din variabilele de mediu! Verifică .env sau setările Render.");
    throw new Error("FATSECRET API keys missing from environment variables.");
}

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
        // Alertă clară dacă răspunsul e legat de cheie greșită
        if (error.response && error.response.status === 401) {
            console.error("❌ FatSecret API: Cheie greșită sau invalidă (401 Unauthorized). Verifică FATSECRET_CLIENT_ID și FATSECRET_CLIENT_SECRET!");
        } else if (error.response && error.response.data && error.response.data.error === "invalid_client") {
            console.error("❌ FatSecret API: Client ID/Secret invalid. Verifică cheile din .env/Render!");
        } else {
            console.error('Error fetching FatSecret API token:', error);
        }
        throw error;
    }
};

// Dacă ai o funcție separată pentru search:
const searchFood = async (query) => {
    const token = await getAuthToken();
    console.log('Token primit pentru FatSecret:', token);

    try {
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

        const foods = searchResponse.data.foods && searchResponse.data.foods.food;
        if (Array.isArray(foods)) {
            const results = foods.map(food => {
                // ...prelucrare food...
                return food;
            });
            // ...folosește results după nevoie...
        } else {
            console.error('foods.food nu este un array:', foods);
        }

        return searchResponse.data;
    } catch (error) {
        console.error('Eroare la request FatSecret:', error.response?.data || error.message);
        throw error;
    }
};

export { getAuthToken, searchFood };