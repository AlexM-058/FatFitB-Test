import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";

// This variable will store the MongoClient instance
let clientInstance;

// Function to initialize the MongoClient with the URI
export const initializeMongoClient = (mongoURI) => {
  clientInstance = new MongoClient(mongoURI);
  return clientInstance;
};

// Helper function to get the "Users" database instance
export const getDb = () => {
  if (!clientInstance) {
    throw new Error(
      "MongoClient not initialized. Call initializeMongoClient first."
    );
  }
  return clientInstance.db("Users"); // Ensure you're using the "Users" database
};

// Function to connect to the database and log collections
export const connectToDatabase = async () => {
  try {
    await clientInstance.connect();
    console.log("✅ Successful connection to MongoDB Atlas!");

    const db = getDb();
    const collections = await db.listCollections().toArray();
    console.log("📁 Collections in 'Users' database:");
    collections.forEach((col) => console.log(` - ${col.name}`));
  } catch (err) {
    console.error("❌ Connection error:", err);
    // It's important to re-throw the error so the server knows the connection failed
    throw err;
  }
};

// User authentication
export const findUserByUsername = async (username) => {
  const db = getDb();
  const users = db.collection("userdata");
  return await users.findOne({ username });
};

// User registration
export const registerUser = async (fullname, username, email, password) => {
  const db = getDb();
  const users = db.collection("userdata");
  const hashedPassword = await bcrypt.hash(password, 10);
  await users.insertOne({
    fullname,
    username,
    email,
    password: hashedPassword,
  });
};

// Check if user or email already exists
export const checkUserExists = async (username, email) => {
  const db = getDb();
  const users = db.collection("userdata");
  return await users.findOne({
    $or: [...(username ? [{ username }] : []), ...(email ? [{ email }] : [])],
  });
};

// Save quiz answers
export const saveAnswers = async (username, answers) => {
  const db = getDb();
  const answersCollection = db.collection("answers");
  await answersCollection.insertOne({
    username,
    answers,
    // submittedAt: new Date(),
  });
};

// Get the latest answers for a user
export const getLatestAnswersForUser = async (username) => {
  const db = getDb();
  const answersCollection = db.collection("answers");
  const result = await answersCollection
    .find({ username })
    // .sort({ submittedAt: -1 })
    .limit(1)
    .toArray();
  console.log(`[getLatestAnswersForUser] Answers fetched for username "${username}":`, result);
  return result;
};
