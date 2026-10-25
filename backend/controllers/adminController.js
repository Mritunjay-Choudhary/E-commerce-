import mongoose from "mongoose";
import User from "../model/User.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getUserByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ message: "Invalid user id." });
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ user });
});
