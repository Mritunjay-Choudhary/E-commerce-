import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

export function uploadBufferToCloudinary(buffer, options = {}) {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: process.env.CLOUDINARY_FOLDER || 'ecommerce',
      resource_type: 'image',
      ...options,
    }, (error, result) => error ? reject(error) : resolve(result));
    Readable.from(buffer).pipe(stream);
  });
}

export async function deleteCloudinaryAsset(publicId) {
  if (!publicId) return;
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}
