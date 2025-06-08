import fetch from "node-fetch";

let fatSecretToken = null;
let tokenExpiry = 0;

// ===============================
// Get FatSecret Access Token
// ===============================
export const getFatSecretToken = async () => {
  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "❌ FATSECRET_CLIENT_ID or FATSECRET_CLIENT_SECRET missing in .env"
    );
    throw new Error("Missing API credentials");
  }

  // Use cached token if still valid
  if (fatSecretToken && Date.now() < tokenExpiry) {
    return fatSecretToken;
  }

  try {
    const response = await fetch("https://oauth.fatsecret.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${clientId}:${clientSecret}`
        ).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`❌ Token error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    fatSecretToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000 - 60000;

    return fatSecretToken;
  } catch (error) {
    console.error("❌ Error fetching FatSecret token:", error.message);
    throw error;
  }
};

// ===============================
// Search for foods
// ===============================
export const searchFoods = async (query) => {
  try {
    const token = await getFatSecretToken();

    const response = await fetch(
      "https://platform.fatsecret.com/rest/server.api",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `method=foods.search&search_expression=${encodeURIComponent(
          query
        )}&format=json`,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`❌ API error: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (err) {
    console.error("❌ Error searching foods:", err.message);
    throw err;
  }
};

// ===============================
// Filter & process foods
// ===============================
export const filterFoods = (query) => {
  try {
    const foodonly = query?.foods?.food;

    if (!Array.isArray(foodonly)) {
      console.warn("⚠️ No foods found or invalid structure:", foodonly);
      return [];
    }

    return foodonly.map((food) => {
      const description = food.food_description || "";

      const caloriesMatch = description.match(/Calories:\s*(\d+)\s*kcal/i);
      const fatMatch = description.match(/Fat:\s*([\d.]+)g/i);
      const carbsMatch = description.match(/Carbs:\s*([\d.]+)g/i);
      const proteinMatch = description.match(/Protein:\s*([\d.]+)g/i);

      return {
        food_id: food.food_id,
        food_name: food.food_name,
        brand_name: food.brand_name,
        food_kcal: caloriesMatch ? Number(caloriesMatch[1]) : null,
        food_fat: fatMatch ? Number(fatMatch[1]) : null,
        food_carbs: carbsMatch ? Number(carbsMatch[1]) : null,
        food_protein: proteinMatch ? Number(proteinMatch[1]) : null,
      };
    });
  } catch (err) {
    console.error("❌ Error filtering foods:", err.message);
    throw err;
  }
};

// ===============================
// Search for recipes
// ===============================
export const searchRecipes = async (query, options = {}) => {
  try {
    const token = await getFatSecretToken();

    const params = new URLSearchParams({
      search_expression: query,
      max_results: options.max_results || "20",
      page_number: options.page_number || "0",
      must_have_images: options.must_have_images ? "true" : "false",
      format: "json",
    });

    if (options.recipe_types) {
      params.append("recipe_types", options.recipe_types);
    }

    if (typeof options.recipe_types_matchall === "boolean") {
      params.append(
        "recipe_types_matchall",
        options.recipe_types_matchall.toString()
      );
    }

    const response = await fetch(
      `https://platform.fatsecret.com/rest/recipes/search/v3?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`❌ Recipe API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      recipes: data?.recipes?.recipe || [],
    };
  } catch (err) {
    console.error("❌ Error searching recipes:", err.message);
    throw err;
  }
};
