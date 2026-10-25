import multer from "multer";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024,
    files: 5,
  },
  fileFilter(_req, file, callback) {
    if (!allowedTypes.has(file.mimetype))
      return callback(
        new Error("Only JPEG, PNG, WebP, or AVIF images are allowed."),
      );
    callback(null, true);
  },
});

export default upload;
