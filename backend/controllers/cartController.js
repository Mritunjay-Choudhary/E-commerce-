import mongoose from "mongoose";
import Cart from "../model/Cart.js";
import Product from "../model/Product.js";
import asyncHandler from "../utils/asyncHandler.js";

async function getOrCreateCart(userId) {
  return Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { new: true, upsert: true },
  );
}

export const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate({
    path: "items.product",
    select: "name slug price currency stock images isActive",
  });
  res.json({ cart: cart || { user: req.user._id, items: [] } });
});

export const addCartItem = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const count = Number(quantity);
  if (
    !mongoose.isValidObjectId(productId) ||
    !Number.isInteger(count) ||
    count < 1
  )
    return res.status(400).json({
      message: "A valid productId and positive integer quantity are required.",
    });
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) return res.status(404).json({ message: "Product not found." });
  const cart = await getOrCreateCart(req.user._id);
  const current = cart.items.find((item) => item.product.equals(product._id));
  if ((current?.quantity || 0) + count > product.stock)
    return res
      .status(409)
      .json({ message: "Requested quantity exceeds available stock." });
  if (current) current.quantity += count;
  else cart.items.push({ product: product._id, quantity: count });
  await cart.save();
  await cart.populate({
    path: "items.product",
    select: "name slug price currency stock images isActive",
  });
  res.status(200).json({ cart });
});

export const updateCartItem = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId))
    return res.status(400).json({ message: "Invalid product id." });
  const count = Number(req.body.quantity);
  if (!Number.isInteger(count) || count < 1)
    return res
      .status(400)
      .json({ message: "Quantity must be a positive integer." });
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart?.items.find((entry) =>
    entry.product.equals(req.params.productId),
  );
  if (!item) return res.status(404).json({ message: "Cart item not found." });
  const product = await Product.findOne({ _id: item.product, isActive: true });
  if (!product)
    return res.status(404).json({ message: "Product is no longer available." });
  if (count > product.stock)
    return res
      .status(409)
      .json({ message: "Requested quantity exceeds available stock." });
  item.quantity = count;
  await cart.save();
  await cart.populate({
    path: "items.product",
    select: "name slug price currency stock images isActive",
  });
  res.json({ cart });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId))
    return res.status(400).json({ message: "Invalid product id." });
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.status(404).json({ message: "Cart item not found." });
  cart.items = cart.items.filter(
    (item) => !item.product.equals(req.params.productId),
  );
  await cart.save();
  await cart.populate({
    path: "items.product",
    select: "name slug price currency stock images isActive",
  });
  res.json({ cart });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $set: { items: [] } },
    { new: true },
  );
  res.json({ cart: cart || { user: req.user._id, items: [] } });
});
