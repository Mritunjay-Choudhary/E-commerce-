import mongoose from "mongoose";

const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    alt: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: "" },
    category: { type: String, required: true, trim: true, index: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    currency: {
      type: String,
      uppercase: true,
      default: "INR",
      minlength: 3,
      maxlength: 3,
    },
    stock: { type: Number, required: true, min: 0, default: 0 },
    images: {
      type: [productImageSchema],
      validate: (images) => images.length <= 5,
      default: [],
    },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },
    averageRating: { type: Number, min: 0, max: 5, default: 0 },
    numReviews: { type: Number, min: 0, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
productSchema.index({
  name: "text",
  description: "text",
  brand: "text",
  tags: "text",
});
export default mongoose.model("Product", productSchema);
