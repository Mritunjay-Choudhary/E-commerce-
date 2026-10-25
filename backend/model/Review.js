import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  comment: { type: String, trim: true, maxlength: 2000, required: true },
}, { timestamps: true });

reviewSchema.index({ product: 1, user: 1 }, { unique: true });
export default mongoose.model('Review', reviewSchema);
