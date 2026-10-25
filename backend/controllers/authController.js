import crypto from "node:crypto";
import User from "../model/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendVerificationEmail, sendWelcomeEmail } from "../utils/email.js";
import { createAccessToken } from "../utils/token.js";

const createOtp = () =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password)
    return res
      .status(400)
      .json({ message: "Name, email, and password are required." });
  if (password.length < 8)
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters." });
  const normalizedEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail }).select(
    "+emailVerificationOtpHash +emailVerificationOtpExpiresAt",
  );
  if (user?.isEmailVerified)
    return res
      .status(409)
      .json({ message: "An account with this email already exists." });

  const otp = createOtp();
  const expiryMs = Number(process.env.OTP_EXPIRY_MINUTES || 10) * 60_000;
  if (user) {
    user.name = name.trim();
    user.password = password;
    user.emailVerificationOtpHash = hashOtp(otp);
    user.emailVerificationOtpExpiresAt = new Date(Date.now() + expiryMs);
    await user.save();
  } else {
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      emailVerificationOtpHash: hashOtp(otp),
      emailVerificationOtpExpiresAt: new Date(Date.now() + expiryMs),
    });
  }
  try {
    await sendVerificationEmail(user.email, user.name, otp);
  } catch (error) {
    await User.deleteOne({ _id: user._id, isEmailVerified: false });
    throw error;
  }
  res.status(201).json({
    message: "Verification code sent to your email.",
    email: user.email,
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !/^\d{6}$/.test(String(otp || "")))
    return res
      .status(400)
      .json({ message: "A valid email and six-digit OTP are required." });
  const user = await User.findOne({
    email: String(email).trim().toLowerCase(),
  }).select("+emailVerificationOtpHash +emailVerificationOtpExpiresAt");
  if (
    !user ||
    user.isEmailVerified ||
    !user.emailVerificationOtpHash ||
    user.emailVerificationOtpExpiresAt < new Date() ||
    !crypto.timingSafeEqual(
      Buffer.from(user.emailVerificationOtpHash),
      Buffer.from(hashOtp(String(otp))),
    )
  ) {
    return res
      .status(400)
      .json({ message: "Invalid or expired verification code." });
  }
  user.isEmailVerified = true;
  user.emailVerificationOtpHash = undefined;
  user.emailVerificationOtpExpiresAt = undefined;
  await user.save();
  await sendWelcomeEmail(user.email, user.name);
  res.json({ message: "Email verified. Your account is ready." });
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  const user = await User.findOne({
    email: String(email).trim().toLowerCase(),
  }).select("+password");
  if (!user || !(await user.comparePassword(password)))
    return res.status(401).json({ message: "Invalid email or password." });
  if (!user.isEmailVerified)
    return res
      .status(403)
      .json({ message: "Verify your email before logging in." });
  if (!user.isActive)
    return res.status(403).json({ message: "This account is disabled." });
  user.lastLoginAt = new Date();
  await user.save();
  const token = createAccessToken(user._id.toString());
  res.cookie("accessToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ message: "Logged in successfully.", token, user: user.toJSON() });
});

export const logoutUser = asyncHandler(async (_req, res) => {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ message: "Logged out successfully." });
});
