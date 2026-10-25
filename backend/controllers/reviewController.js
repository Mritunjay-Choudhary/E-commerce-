import mongoose from 'mongoose';
import Order from '../model/Order.js';
import Product from '../model/Product.js';
import Review from '../model/Review.js';
import asyncHandler from '../utils/asyncHandler.js';

async function refreshProductRating(productId) {
  const [summary] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: '$product', averageRating: { $avg: '$rating' }, numReviews: { $sum: 1 } } },
  ]);
  await Product.updateOne({ _id: productId }, { $set: { averageRating: summary?.averageRating || 0, numReviews: summary?.numReviews || 0 } });
}

export const listProductReviews = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) return res.status(400).json({ message: 'Invalid product id.' });
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const filter = { product: req.params.productId };
  const [reviews, total] = await Promise.all([
    Review.find(filter).populate('user', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Review.countDocuments(filter),
  ]);
  res.json({ reviews, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const createOrUpdateReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim();
  if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Invalid product id.' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) return res.status(400).json({ message: 'A 1–5 rating and review comment are required.' });
  const product = await Product.findOne({ _id: productId, isActive: true }).select('_id');
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  const hasPurchased = await Order.exists({
    user: req.user._id,
    orderStatus: 'delivered',
    'items.product': product._id,
  });
  if (!hasPurchased) return res.status(403).json({ message: 'You can review a product after its order has been delivered.' });
  const review = await Review.findOneAndUpdate(
    { product: product._id, user: req.user._id },
    { $set: { rating, comment, title: String(req.body.title || '').trim() }, $setOnInsert: { product: product._id, user: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await refreshProductRating(product._id);
  res.status(200).json({ review });
});

export const deleteReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.reviewId)) return res.status(400).json({ message: 'Invalid review id.' });
  const filter = { _id: req.params.reviewId };
  if (req.user.role !== 'admin') filter.user = req.user._id;
  const review = await Review.findOneAndDelete(filter);
  if (!review) return res.status(404).json({ message: 'Review not found.' });
  await refreshProductRating(review.product);
  res.json({ message: 'Review deleted.' });
});
