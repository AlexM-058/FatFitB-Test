import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware pentru autentificare JWT din cookie SAU header Authorization
export const authenticateToken = (req, res, next) => {
  
  const token =
    req.cookies.token ||
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : undefined);

  if (!token) {
    return res.status(401).json({ message: "JWT missing" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid JWT" });
    }
    req.user = decoded;
    next();
  });
};
