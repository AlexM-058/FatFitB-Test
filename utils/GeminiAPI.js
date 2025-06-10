import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
// Base URL pentru Fitness Tribe AI API (cel Python pe care l-ai deploy-at)
const BASE_URL = "https://fitness-tribe-ai.onrender.com"; // Verifică dacă acesta este URL-ul corect și accesibil public

const fitnessApiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    
    Authorization: `Bearer ${API_KEY}`,
  },
});

/**
 * 
 * @param {object} userData 
 * @returns {Promise<object|null>} 
 */
async function generateRecipes(userData) {
  const endpoint = "/nutrition-plans/generate"; 

  if (!API_KEY) {
    console.error(
      "Eroare: FITNESS_TRIBE_API_KEY nu este setată în variabilele de mediu."
    );
    throw new Error("Cheia API pentru Fitness Tribe AI nu este configurată.");
  }
  console.log(
    "generateRecipes() - API_KEY (primele 5 caractere):",
    API_KEY ? API_KEY.substring(0, 5) + "..." : "N/A"
  );
  console.log("generateRecipes() - BASE_URL:", BASE_URL);
  console.log("generateRecipes() - Endpoint:", endpoint);
  console.log(
    "generateRecipes() - userData trimis către API:",
    JSON.stringify(userData, null, 2)
  );

  try {
    const response = await fitnessApiClient.post(endpoint, userData);
    console.log(
      "generateRecipes() - răspuns primit de la API:",
      JSON.stringify(response.data, null, 2)
    );
    return response.data;
  } catch (error) {
    console.error(
      "Eroare la apelul către Fitness Tribe AI API (în generateRecipes):"
    );
    if (error.response) {
      console.error("  Status API extern:", error.response.status);
      console.error(
        "  Data API extern:",
        JSON.stringify(error.response.data, null, 2)
      );
      throw new Error(
        `Eroare de la Fitness Tribe API: ${
          error.response.status
        } - ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error(
        "  Nu s-a primit răspuns de la Fitness Tribe API (timeout sau server indisponibil)."
      );
      throw new Error(
        "Nu s-a putut contacta Fitness Tribe API. Verificați URL-ul sau statusul serverului."
      );
    } else {
      console.error(
        "  Eroare la configurarea cererii către Fitness Tribe API:",
        error.message
      );
      throw new Error(
        `Eroare neașteptată la apelul API Fitness Tribe: ${error.message}`
      );
    }
  }
}

export { generateRecipes };
