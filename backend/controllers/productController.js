import mongoose from "mongoose";
import Product from "../model/Product.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  deleteCloudinaryAsset,
  uploadBufferToCloudinary,
} from "../utils/cloudinaryUpload.js";

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const listValue = (value) =>
  Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
const fields = [
  "name",
  "description",
  "brand",
  "category",
  "sku",
  "currency",
  "price",
  "compareAtPrice",
  "stock",
  "isActive",
  "isFeatured",
];

async function uploadImages(files = []) {
  const images = [];
  try {
    for (const file of files) {
      const result = await uploadBufferToCloudinary(file.buffer);
      images.push({
        url: result.secure_url,
        publicId: result.public_id,
        alt: "",
      });
    }
    return images;
  } catch (error) {
    await Promise.allSettled(
      images.map(({ publicId }) => deleteCloudinaryAsset(publicId)),
    );
    throw error;
  }
}

export const listProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const filter = { isActive: true };
  if (req.query.category) filter.category = String(req.query.category).trim();
  if (req.query.featured === "true") filter.isFeatured = true;
  if (req.query.search)
    filter.$text = { $search: String(req.query.search).trim() };
  const price = {};
  if (Number.isFinite(Number(req.query.minPrice)))
    price.$gte = Number(req.query.minPrice);
  if (Number.isFinite(Number(req.query.maxPrice)))
    price.$lte = Number(req.query.maxPrice);
  if (Object.keys(price).length) filter.price = price;
  const sorts = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { averageRating: -1 },
  };
  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sorts[req.query.sort] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(filter),
  ]);
  res.json({
    products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const filter = mongoose.isValidObjectId(req.params.id)
    ? { _id: req.params.id }
    : { slug: req.params.id };
  const product = await Product.findOne({ ...filter, isActive: true });
  if (!product) return res.status(404).json({ message: "Product not found." });
  res.json({ product });
});

export const createProduct = asyncHandler(async (req, res) => {
  const { name, description, category, price, stock } = req.body;
  if (
    !name?.trim() ||
    !description?.trim() ||
    !category?.trim() ||
    price === undefined ||
    stock === undefined
  )
    return res
      .status(400)
      .json({
        message: "Name, description, category, price, and stock are required.",
      });
  const images = await uploadImages(req.files);
  try {
    const data = {
      createdBy: req.user._id,
      images,
      slug: slugify(req.body.slug || name),
      tags: listValue(req.body.tags),
      price: Number(price),
      stock: Number(stock),
    };
    for (const field of fields)
      if (req.body[field] !== undefined) data[field] = req.body[field];
    const product = await Product.create(data);
    res.status(201).json({ product });
  } catch (error) {
    await Promise.allSettled(
      images.map(({ publicId }) => deleteCloudinaryAsset(publicId)),
    );
    throw error;
  }
});

export const updateProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ message: "Invalid product id." });
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found." });
  const uploaded = await uploadImages(req.files);
  const previousImages = product.images;
  try {
    for (const field of fields)
      if (req.body[field] !== undefined) product[field] = req.body[field];
    if (req.body.slug || req.body.name)
      product.slug = slugify(req.body.slug || req.body.name);
    if (req.body.tags !== undefined) product.tags = listValue(req.body.tags);
    if (req.body.replaceImages === "true") product.images = uploaded;
    else if (uploaded.length) product.images.push(...uploaded);
    if (product.images.length > 5)
      throw Object.assign(
        new Error("A product can have at most five images."),
        { status: 400 },
      );
    await product.save();
  } catch (error) {
    await Promise.allSettled(
      uploaded.map(({ publicId }) => deleteCloudinaryAsset(publicId)),
    );
    throw error;
  }
  if (req.body.replaceImages === "true")
    await Promise.allSettled(
      previousImages.map(({ publicId }) => deleteCloudinaryAsset(publicId)),
    );
  res.json({ product });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ message: "Invalid product id." });
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true },
  );
  if (!product) return res.status(404).json({ message: "Product not found." });
  res.json({ message: "Product archived.", product });
});
