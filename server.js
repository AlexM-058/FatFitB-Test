import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fs from "fs";
import cors from "cors";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import schedule from "node-schedule";

import {
  initializeMongoClient,
  connectToDatabase,
  findUserByUsername,
  registerUser,
  checkUserExists,
  saveAnswers,
  getLatestAnswersForUser,
  getDb,
} from "./utils/dbFunctions.js";

import { calculateCalories, convertGoal } from "./utils/CalorieCalculations.js";
import {
  searchFoods,
  filterFoods,
  searchRecipes,
} from "./utils/fatsecretApi.js";
import { generateRecipes } from "./utils/GeminiAPI.js";
import { authenticateToken } from "./utils/AuthToken.js";

const app = express();
const PORT = process.env.PORT || 3001; // Use process.env.PORT for deploy

const raw = fs.readFileSync("./data/quiz.json", "utf-8");
const quiz = JSON.parse(raw);

const client = initializeMongoClient(process.env.MONGO_URI);
connectToDatabase();

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key";

app.use(cookieParser());

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://fatfit.onrender.com",
    "https://fatfitb-test.onrender.com"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Înlocuiește linia aceasta:
// app.options("*", cors());
// cu:
app.options("*", cors());

// Parse JSON bodies
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("Backend operational");
});

// Serve quiz data
app.get("/quiz", (req, res) => {
  res.send(quiz);
});

// Check if user exists by username or email
app.post("/check-user", async (req, res) => {
  const { username, email } = req.body;

  if (!username && !email) {
    return res.status(400).json({
      exists: false,
      message: "Username or email missing",
    });
  }

  try {
    const existingUser = await checkUserExists(username, email);
    res.status(200).json({ exists: !!existingUser });
  } catch (err) {
    console.error("Check error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Register a new user
app.post("/register", async (req, res) => {
  try {
    const { fullname, username, email, password } = req.body;

    if (!username || !password || !email || !fullname) {
      return res.status(400).json({
        message: "Username, email, fullname, and password are required.",
      });
    }

    const existingUser = await checkUserExists(username, email);
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }

    // Hash the password before saving!
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user with hashed password in the correct collection
    const db = getDb();
    await db.collection("userdata").insertOne({
      fullname,
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "User registered successfully!" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Login endpoint - sets JWT as httpOnly cookie and returns it in the response for frontend
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }
  try {
    const TheUser = await findUserByUsername(username);
    if (!TheUser) {
      return res.status(401).json({ message: "Incorrect username or password." });
    }
    const isMatch = await bcrypt.compare(password, TheUser.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect username or password." });
    }
    // Generate JWT token
    const token = jwt.sign(
      {
        username: TheUser.username,
        id: TheUser._id,
        rights: TheUser.rights || 0,
        iss: "FatFit"
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );
    // Set token as httpOnly cookie, allow cross-origin with credentials
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "none", // important for cross-origin cookies!
      secure: true      // must be true for sameSite: 'none'
    });
    // Return token in response for frontend (for setToken in AuthService/jwt.js)
    return res.status(200).json({ success: true, message: "Login successful!", token });
  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ message: "Server error during login." });
  }
});


app.get("/fatfit/:username", authenticateToken, async (req, res) => {
  const { username } = req.params;

  try {
    const db = getDb();
    const user = await db
      .collection("userdata")
      .findOne({ username }, { projection: { password: 0 } });

    if (!user) return res.status(404).json({ message: "User not found." });

    const latestAnswers = await getLatestAnswersForUser(username);

    let processedAnswers = null;
    let dailyCalorieTarget = null;

    if (latestAnswers.length > 0) {
      const ans = latestAnswers[0].answers;
      processedAnswers = {
        age: parseInt(ans["1.What is your age?"], 10),
        gender: ans["2.What is your gender?"].toLowerCase(),
        weight: parseFloat(ans["3.What is your current weight?"]),
        height: parseFloat(ans["4.What is your height?"]),
        goal: convertGoal(ans["5.What is your primary goal?"]),
      };
      dailyCalorieTarget = calculateCalories(processedAnswers);
    }

    res.status(200).json({
      user,
      extractedUserAnswers: processedAnswers,
      dailyCalorieTarget,
      message: `Welcome to your personalized FatFit page, ${username}!`,
    });
  } catch (err) {
    console.error("Error accessing fatfit page:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Search foods via FatSecret API
app.get("/fatsecret-search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing search query" });

  try {
    const data = await searchFoods(query);
    res.json(filterFoods(data));
  } catch (err) {
    res.status(500).json({
      error: "Server error contacting FatSecret API",
      details: err.message,
    });
  }
});

app.get("/recipes/search", async (req, res) => {
  try {
    const options = {
      search_expression: req.query.q || "",
      max_results: req.query.max_results ? Number(req.query.max_results) : 20,
      page_number: req.query.page_number ? Number(req.query.page_number) : 0,
      must_have_images: req.query.must_have_images === "true",
      // Add other options from req.query as needed
    };

    const recipes = await searchRecipes(options);
    res.json({ recipes });
  } catch (error) {
    console.error("Error in /recipes/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recipes/search", async (req, res) => {
  try {
    const query = req.query.q || "";
    const options = {
      max_results: req.query.max_results,
      page_number: req.query.page_number,
      must_have_images: req.query.must_have_images === "true",
      recipe_types: req.query.recipe_types,
      recipe_types_matchall: req.query.recipe_types_matchall === "true",
    };

    const data = await searchRecipes(query, options);
    let recipesArray = [];
    if (Array.isArray(data)) {
      recipesArray = data;
    } else if (data && Array.isArray(data.recipes)) {
      recipesArray = data.recipes;
    } else if (data && data.recipes && Array.isArray(data.recipes.recipe)) {
      recipesArray = data.recipes.recipe;
    }
    res.json(recipesArray);
  } catch (error) {
    console.error("Error in /api/recipes/search:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Update username
app.put("/user/:username", async (req, res) => {
  const { username } = req.params;
  const { newUsername } = req.body;

  if (!newUsername || typeof newUsername !== "string" || !newUsername.trim()) {
    return res.status(400).json({ message: "New username is required." });
  }

  try {
    const db = getDb();
    // Check if new username already exists
    const existing = await db
      .collection("userdata")
      .findOne({ username: newUsername });
    if (existing) {
      return res.status(400).json({ message: "Username already taken." });
    }
    // Update username in userdata
    const result = await db
      .collection("userdata")
      .updateOne({ username }, { $set: { username: newUsername } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    // Update username in answers (if you store answers by username)
    await db
      .collection("answers")
      .updateMany({ username }, { $set: { username: newUsername } });
    res.json({ message: "Username updated successfully." });
  } catch (err) {
    console.error("Error updating username:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Delete user account
app.delete("/user/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const db = getDb();
    // Delete user from userdata
    const result = await db.collection("userdata").deleteOne({ username });
    // Delete user's answers (optional)
    await db.collection("answers").deleteMany({ username });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({ message: "User deleted successfully." });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Generate recipes for a specific user using Fitness Tribe AI API
app.post('/api/fitness-tribe/recipes/:username', async (req, res) => {
    const { username } = req.params;
    if (!username || username === "undefined" || username === "null" || username.trim() === "") {
        return res.status(400).json({ error: "Username is required in the URL." });
    }
    // Check for cached recipes in cookies
    if (req.cookies && req.cookies[`ai_recipes_${username}`]) {
        try {
            const cached = JSON.parse(req.cookies[`ai_recipes_${username}`]);
            if (cached && cached.meal_plan) {
                return res.json(cached);
            }
        } catch (e) {
            // Ignore parse error, proceed to generate
        }
    }
    console.log(`Recipe generation request for user: '${username}'`);
    try {
        const db = getDb();
        const user = await db
            .collection("userdata")
            .findOne({ username }, { projection: { password: 0 } });

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const latestAnswers = await getLatestAnswersForUser(username);
        if (!latestAnswers || latestAnswers.length === 0) {
            return res.status(404).json({ error: 'No quiz answers found for this user.' });
        }

        const ans = latestAnswers[0].answers;

        let dietary_preferences = [];
        let food_intolerances = [];

        if (Array.isArray(ans["6.What are your dietary preferences?"])) {
            dietary_preferences = ans["6.What are your dietary preferences?"].filter(opt => opt !== "None");
        } else if (typeof ans["6.What are your dietary preferences?"] === "string" && ans["6.What are your dietary preferences?"] !== "None") {
            dietary_preferences = [ans["6.What are your dietary preferences?"]];
        }
        // FIX: folosește "or" nu "sau"
        if (Array.isArray(ans["7.Do you have any food intolerances or allergies?"])) {
            food_intolerances = ans["7.Do you have any food intolerances or allergies?"].filter(opt => opt !== "None");
        } else if (typeof ans["7.Do you have any food intolerances sau allergies?"] === "string" && ans["7.Do you have any food intolerances sau allergies?"] !== "None") {
            food_intolerances = [ans["7.Do you have any food intolerances sau allergies?"]];
        }

        // You can set a default duration_weeks or extract from another answer if you add it to the quiz
        const userData = {
          weight: parseFloat(ans["3.What is your current weight?"]),
          height: parseFloat(ans["4.What is your height?"]),
          age: parseInt(ans["1.What is your age?"], 10),
          sex: ans["2.What is your gender?"]?.toLowerCase(),
          goal: convertGoal(ans["5.What is your primary goal?"]),
          dietary_preferences,
          food_intolerances,
          duration_weeks: 4 
        };

        console.log("userData sent to generateRecipes:", userData);

        const recipes = await generateRecipes(userData);
        console.log("generateRecipes response:", recipes);

        if (!recipes) {
            console.log("generateRecipes returned nothing for user:", username, "userData:", userData);
            return res.status(502).json({ error: 'No response from Fitness Tribe API. Please try again later.' });
        }
        if (recipes.detail) {
            return res.status(502).json({ error: 'Fitness Tribe API error', details: recipes.detail });
        }
        if (recipes.meal_plan) {
            // Save to cookie for 1 hour
            res.cookie(`ai_recipes_${username}`, JSON.stringify(recipes), {
                maxAge: 60 * 60 * 1000,
                httpOnly: false, // allow frontend JS to read
                sameSite: "lax"
            });
            res.json(recipes);
        } else {
            res.status(500).json({ error: 'Could not generate nutrition plan.', details: recipes });
        }
    } catch (error) {
        console.error("Error generating nutrition plan:", error);
        res.status(500).json({ error: 'Error generating nutrition plan.' });
    }
});

// Generate workout plan for a specific user using Fitness Tribe AI API
app.post('/api/fitness-tribe/workout/:username', async (req, res) => {
    const { username } = req.params;
    if (!username || username === "undefined" || username === "null" || username.trim() === "") {
        return res.status(400).json({ error: "Username is required in the URL." });
    }
    try {
        const db = getDb();
        const user = await db
            .collection("userdata")
            .findOne({ username }, { projection: { password: 0 } });

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const latestAnswers = await getLatestAnswersForUser(username);
        if (!latestAnswers || latestAnswers.length === 0) {
            return res.status(404).json({ error: 'No quiz answers found for this user.' });
        }

        const ans = latestAnswers[0].answers;

        // Extract workouts_per_week from quiz answers (example: question 8)
        let workouts_per_week = 3;
        // Accept only values between 2 and 7
        if (ans["8.How many days per week do you plan to work out?"]) {
            const val = ans["8.How many days per week do you plan to work out?"];
            // Try to parse as number, fallback to mapping
            let parsed = parseInt(val, 10);
            if (!isNaN(parsed) && parsed >= 2 && parsed <= 7) {
                workouts_per_week = parsed;
            } else {
                // fallback mapping for text answers
                const workoutMap = {
                    "2 days": 2,
                    "3 days": 3,
                    "4 days": 4,
                    "5 days": 5,
                    "6 days": 6,
                    "7 days": 7
                };
                workouts_per_week = workoutMap[val] || 3;
            }
        }

        const userData = {
          weight: parseFloat(ans["3.What is your current weight?"]),
          height: parseFloat(ans["4.What is your height?"]),
          age: parseInt(ans["1.What is your age?"], 10),
          sex: ans["2.What is your gender?"]?.toLowerCase(), // <-- fix aici
          goal: convertGoal(ans["5.What is your primary goal?"]),
          workouts_per_week
        };

        // GeminiAPI endpoint for workout plan
        const axios = (await import('axios')).default;
        const API_KEY = process.env.FITNESS_TRIBE_API_KEY;
        const BASE_URL = "https://fitness-tribe-ai.onrender.com";
        const endpoint = "/workout-plans/generate";

        try {
            const response = await axios.post(
                BASE_URL + endpoint,
                userData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    }
                }
            );
            res.json(response.data);
        } catch (apiError) {
            if (apiError.response) {
                res.status(apiError.response.status).json({ error: apiError.response.data });
            } else {
                res.status(500).json({ error: "Error contacting Fitness Tribe API." });
            }
        }
    } catch (error) {
        console.error("Error generating workout plan:", error);
        res.status(500).json({ error: 'Error generating workout plan.' });
    }
});

// In-memory array to store calories data (per session/server run)


// Add calories entry and save in cookie for 24h (midnight to midnight)
app.post("/api/calories/:username", async (req, res) => {
  const { username } = req.params;
  const { foods, mealType } = req.body;

  if (
    !username ||
    !Array.isArray(foods) ||
    !["breakfast", "lunch", "dinner", "snacks"].includes(mealType)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid request: missing or incorrect username, foods, or mealType.",
    });
  }

  const isValidFood = (food) =>
    food.name &&
    typeof food.calories === "number" &&
    typeof food.protein === "number" &&
    typeof food.carbs === "number" &&
    typeof food.fat === "number";

  if (!foods.every(isValidFood)) {
    return res.status(400).json({
      success: false,
      message: "Each food must have name, calories, protein, carbs, and fat.",
    });
  }

  try {
    const db = getDb();

    // Normalize date to just the day, no time
    const today = new Date();
    const dateKey = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    // Upsert: if document exists, add to foods array
    const result = await db
      .collection("food")
      .updateOne(
        { username, mealType, date: dateKey },
        { $push: { foods: { $each: foods } } },
        { upsert: true }
      );

    res.status(201).json({
      success: true,
      message: `Added ${foods.length} food(s) to ${mealType} for ${username}.`,
    });
  } catch (err) {
    console.error("Error saving grouped food entries:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


// Get all calories entries (prefer cookie if present)

app.get("/caloriecounter/:username/lunch", async (req, res) => {
  const username = req.params.username;

  if (!username) {
    return res.status(400).json({ error: "Username is required in URL path" });
  }

  try {
    const db = getDb();

    // Caută toate documentele pentru utilizator cu mealType = "lunch"
    const lunchDocs = await db
      .collection("food")
      .find({
        username: username,
        mealType: "lunch"
      })
      .toArray();

   
    // Extrage toate obiectele individuale din array-ul foods (dacă există)
    let allFoods = [];
    if (lunchDocs.length > 0) {
      // Dacă documentele au array-ul foods, extrage-le
      allFoods = lunchDocs.flatMap(doc =>
        Array.isArray(doc.foods) ? doc.foods : []
      );
      // Dacă nu există array-ul foods, dar datele sunt direct pe document, adaugă-le
      if (allFoods.length === 0) {
        allFoods = lunchDocs;
      }
    }

    res.json({ foods: allFoods });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Add endpoint for breakfast
app.get("/caloriecounter/:username/breakfast", async (req, res) => {
  const username = req.params.username;

  if (!username) {
    return res.status(400).json({ error: "Username is required in URL path" });
  }

  try {
    const db = getDb();

    const breakfastDocs = await db
      .collection("food")
      .find({
        username: username,
        mealType: "breakfast"
      })
      .toArray();

    let allFoods = [];
    if (breakfastDocs.length > 0) {
      allFoods = breakfastDocs.flatMap(doc =>
        Array.isArray(doc.foods) ? doc.foods : []
      );
      if (allFoods.length === 0) {
        allFoods = breakfastDocs;
      }
    }

    res.json({ foods: allFoods });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Add endpoint for dinner
app.get("/caloriecounter/:username/dinner", async (req, res) => {
  const username = req.params.username;

  if (!username) {
    return res.status(400).json({ error: "Username is required in URL path" });
  }

  try {
    const db = getDb();

    const dinnerDocs = await db
      .collection("food")
      .find({
        username: username,
        mealType: "dinner"
      })
      .toArray();

    let allFoods = [];
    if (dinnerDocs.length > 0) {
      allFoods = dinnerDocs.flatMap(doc =>
        Array.isArray(doc.foods) ? doc.foods : []
      );
      if (allFoods.length === 0) {
        allFoods = dinnerDocs;
      }
    }

    res.json({ foods: allFoods });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Add endpoint for snacks
app.get("/caloriecounter/:username/snacks", async (req, res) => {
  const username = req.params.username;

  if (!username) {
    return res.status(400).json({ error: "Username is required in URL path" });
  }

  try {
    const db = getDb();

    const snacksDocs = await db
      .collection("food")
      .find({
        username: username,
        mealType: "snacks"
      })
      .toArray();

    let allFoods = [];
    if (snacksDocs.length > 0) {
      allFoods = snacksDocs.flatMap(doc =>
        Array.isArray(doc.foods) ? doc.foods : []
      );
      if (allFoods.length === 0) {
        allFoods = snacksDocs;
      }
    }

    res.json({ foods: allFoods });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/caloriecounter/:username/total", async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ error: "Username is required in URL path" });
  }
  try {
    const db = getDb();
    const entry = await db.collection("calories").findOne({ username });
    res.json({ username, totalCalories: entry ? entry.totalCalories : 0 });
  } catch (err) {
    console.error("Error fetching total calories:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// PUT total calories for a user (create or update)
app.put("/caloriecounter/:username/total", async (req, res) => {
  const { username } = req.params;
  const { totalCalories } = req.body;
  if (!username || typeof totalCalories !== "number") {
    return res
      .status(400)
      .json({ error: "Username and totalCalories (number) required" });
  }
  try {
    const db = getDb();
    await db
      .collection("calories")
      .updateOne({ username }, { $set: { totalCalories } }, { upsert: true });
    res.json({ success: true, username, totalCalories });
  } catch (err) {
    console.error("Error saving total calories:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Job pentru resetarea caloriilor la 00:01 în fiecare zi
schedule.scheduleJob('1 0 * * *', async function () {
  try {
    const db = getDb();
    const result = await db.collection("calories").deleteMany({});
    console.log(`[AUTO-CLEANUP] Deleted ${result.deletedCount} calories entries at 00:01`);
  } catch (err) {
    console.error("[AUTO-CLEANUP] Error deleting calories entries:", err);
  }
});

// Add calories entry for recipes (only requires name, calories, mealType)
app.post("/api/recipes-calories/:username", async (req, res) => {
  const { username } = req.params;
  const { foods, mealType } = req.body;

  if (
    !username ||
    !Array.isArray(foods) ||
    !["breakfast", "lunch", "dinner", "snacks"].includes(mealType)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid request: missing or incorrect username, foods, or mealType.",
    });
  }

  // Only check for name and calories
  const isValidRecipeFood = (food) =>
    food.name && typeof food.calories === "number";

  if (!foods.every(isValidRecipeFood)) {
    return res.status(400).json({
      success: false,
      message: "Each food must have name and calories.",
    });
  }

  try {
    const db = getDb();

    // Normalize date to just the day, no time
    const today = new Date();
    const dateKey = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    // Upsert: if document exists, add to foods array
    const result = await db
      .collection("food")
      .updateOne(
        { username, mealType, date: dateKey },
        { $push: { foods: { $each: foods } } },
        { upsert: true }
      );

    res.status(201).json({
      success: true,
      message: `Added ${foods.length} recipe(s) to ${mealType} for ${username}.`,
    });
  } catch (err) {
    console.error("Error saving recipe food entries:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Reset password
app.patch("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ message: "Email and newPassword are required." });
  }
  try {
    const db = getDb();
    const user = await db.collection("userdata").findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User with this email not found." });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection("userdata").updateOne(
      { email },
      { $set: { password: hashedPassword } }
    );
    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Delete a food item from foods array for a user and mealType (no date filter)
app.delete("/food/:username/:mealType", async (req, res) => {
  const { username, mealType } = req.params;
  const { foodName } = req.body;

  if (!username || !mealType || !foodName) {
    return res.status(400).json({ error: "username, mealType, and foodName are required." });
  }

  try {
    const db = getDb();
    // Remove the food item with foodName from all foods arrays for the user and mealType (all dates)
    const result = await db.collection("food").updateMany(
      { username, mealType },
      { $pull: { foods: { name: foodName } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Food item not found for this user and mealType." });
    }

    res.json({ success: true, message: `Food item '${foodName}' was deleted from ${mealType} for ${username}.` });
  } catch (err) {
    console.error("Error deleting food item:", err);
    res.status(500).json({ error: "Error deleting food item." });
  }
});

// Save quiz answers for a user (endpoint for quiz submission)
app.post("/answers", async (req, res) => {
  const { username, answers } = req.body;

  if (!username || !answers || typeof answers !== "object") {
    return res.status(400).json({
      success: false,
      message: "Username or answers are missing or invalid.",
    });
  }

  try {
    await saveAnswers(username, answers);
    res.status(201).json({
      success: true,
      message: "Answers saved successfully!",
    });
  } catch (err) {
    console.error("Error saving answers:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
