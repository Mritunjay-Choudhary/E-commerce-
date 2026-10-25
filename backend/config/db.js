import mongoose from 'mongoose';

export default async function connectDB() {
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) throw new Error('MONGODB_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGODB_URI);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
