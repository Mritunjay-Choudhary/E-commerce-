import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import configureCloudinary from "./config/cloudinary.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";

const app = express();
const port = Number(process.env.PORT) || 5000;

app.disable("x-powered-by");
app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(",") ?? true,
    credentials: true,
  }),
);
app.use("/api/webhooks", webhookRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/products", reviewRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use(notFound);
app.use(errorHandler);

await connectDB();
configureCloudinary();
app.listen(port, () => console.log(`Server is listening on port ${port}`));
