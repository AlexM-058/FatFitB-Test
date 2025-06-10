import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateToken = (req, res, next) => {
  // Folosește 'token' pentru consistență cu server.js
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "No token provided." });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token." });
    req.user = decoded;
    next();
  });
};
