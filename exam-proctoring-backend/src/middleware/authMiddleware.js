import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authMiddleware = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return res.status(401).json({ message: "User no longer exists." });
      }

      req.user = user;
      return next(); // 🔴 MUST return here
    } catch (error) {
      return res.status(401).json({ message: "Not authorized, token invalid." });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided." });
};
