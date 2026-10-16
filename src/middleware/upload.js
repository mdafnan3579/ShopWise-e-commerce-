import multer from 'multer';
import { AppError } from '../utils/AppError.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 5;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/**
 * Multipart parser for product images (field name `images`). Files stay in memory and are
 * streamed straight to Cloudinary. Size, count and type limits are enforced while streaming,
 * so an oversized upload is rejected before it is fully buffered.
 */
export const productImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_FILES_PER_UPLOAD },
  fileFilter(_req, file, callback) {
    if (ALLOWED_TYPES.has(file.mimetype)) return callback(null, true);
    callback(
      new AppError('Only JPEG, PNG, WebP or AVIF images are allowed', 400, 'INVALID_FILE_TYPE'),
    );
  },
}).array('images', MAX_FILES_PER_UPLOAD);
