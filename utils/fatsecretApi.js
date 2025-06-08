import fetch from "node-fetch";

let fatSecretToken = null;
let tokenExpiry = 0; // Token expiry timestamp

export const getFatSecretToken = async () => {
  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

  console.log("FATSECRET_CLIENT_ID:", clientId);
  console.log("FATSECRET_CLIENT_SECRET:", clientSecret ? "*****" : null);

  if (!clientId || !clientSecret) {
    console.error(
      "FATSECRET_CLIENT_ID or FATSECRET_CLIENT_SECRET is not defined in environment variables"
    );
    throw new Error(
      "API credentials missing. Please check your environment variables."
    );
  }

  // Return cached token if still valid
  if (fatSecretToken && Date.now() < tokenExpiry) {
    console.log("Using cached FatSecret token");
    return fatSecretToken;
  }

  try {
    // Request new token from OAuth endpoint
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
      console.error(
        `Failed to get FatSecret token: ${response.status} - ${errorText}`
      );
      throw new Error(
        `Failed to get FatSecret token: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    fatSecretToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000 - 60000;
    console.log(
      "Received new FatSecret token, expires in",
      data.expires_in,
      "seconds"
    );
    return fatSecretToken;
  } catch (error) {
    console.error("Error fetching FatSecret token:", error);
    throw error; // Propagate error
  }
};

// Search foods by query string using FatSecret API
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
      console.error(`FatSecret API error: ${errorText}`);
      throw new Error(`FatSecret API error: ${errorText}`);
    }

    const json = await response.json();
    console.log("FatSecret API response for foods.search:", json);
    return json;
  } catch (err) {
    console.error("Error searching FatSecret foods:", err);
    throw err; // Propagate error
  }
};

// Process raw food data to extract key nutritional info and clean unnecessary fields
export const filterFoods = (query) => {
  try {
    const foodonly = query.foods?.food;
    if (!foodonly) {
      console.warn("No foods found in response to filter");
      return [];
    }

    foodonly.forEach((food) => {
      delete food.food_url;

      const description = food.food_description || "";

      // Extract calories, fat, carbs, protein from description text
      const caloriesMatch = description.match(/Calories:\s*(\d+)\s*kcal/i);
      const fatMatch = description.match(/Fat:\s*([\d.]+)g/i);
      const carbsMatch = description.match(/Carbs:\s*([\d.]+)g/i);
      const proteinMatch = description.match(/Protein:\s*([\d.]+)g/i);

      food.food_kcal = caloriesMatch ? Number(caloriesMatch[1]) : null;
      food.food_fat = fatMatch ? Number(fatMatch[1]) : null;
      food.food_carbs = carbsMatch ? Number(carbsMatch[1]) : null;
      food.food_protein = proteinMatch ? Number(proteinMatch[1]) : null;

      delete food.food_description;
    });
    return foodonly;
  } catch (err) {
    console.error("Error filtering foods:", err);
    throw err; // Propagate error
  }
};

// Fetch recipe types from FatSecret API
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
      console.error(
        `FatSecret recipes API error: ${response.status} - ${errorText}`
      );
      throw new Error(
        `FatSecret recipes API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    console.log("FatSecret API response for recipes.search:", data);

    const recipesArray = data?.recipes?.recipe || [];
    return { recipes: recipesArray };
  } catch (err) {
    console.error("Error searching FatSecret recipes:", err);
    throw err;
  }
};
