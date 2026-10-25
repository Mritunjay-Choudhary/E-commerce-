import jwt from "jsonwebtoken";
import User from "../model/User.js";
import asyncHandler from "../utils/asyncHandler.js";

export const protect = asyncHandler(async (req, res, next) => {
  const cookieToken = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("accessToken="))
    ?.slice("accessToken=".length);
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token =
    bearer || (cookieToken ? decodeURIComponent(cookieToken) : null);
  if (!token)
    return res.status(401).json({ message: "Authentication required." });
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || !user.isEmailVerified)
    return res.status(401).json({ message: "Account is unavailable." });
  req.user = user;
  next();
});

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Administrator access required." });
  next();
}
