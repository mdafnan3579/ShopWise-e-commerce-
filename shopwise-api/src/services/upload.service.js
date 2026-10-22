import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

const PRODUCT_FOLDER = 'shopwise/products';
let configured = false;

export function isUploadConfigured() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function ensureConfigured() {
  if (!isUploadConfigured()) {
    throw new AppError('Image uploads are not configured', 503, 'UPLOADS_UNAVAILABLE');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
}

/**
 * Streams an in-memory image buffer to Cloudinary (no temp files on disk).
 * Cloudinary caps the size and serves auto-format/auto-quality variants via its CDN.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export function uploadProductImage(buffer) {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PRODUCT_FOLDER,
        resource_type: 'image',
        transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
      },
      (err, result) => {
        if (err || !result) {
          logger.error({ err }, 'Cloudinary upload failed');
          return reject(new AppError('Image upload failed', 502, 'UPLOAD_FAILED'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/** Best-effort delete: a leftover asset is not worth failing the request over. */
export async function deleteImage(publicId) {
  if (!publicId || !isUploadConfigured()) return;
  try {
    ensureConfigured();
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn({ err, publicId }, 'Failed to delete image from Cloudinary');
  }
}
