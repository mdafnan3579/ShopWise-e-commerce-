import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One row per issued refresh token. Only a SHA-256 hash of the token is stored, so a database
 * leak does not leak usable sessions.
 *
 * `family` groups all tokens descended from one login. Rotation revokes the presented token and
 * issues a new one in the same family; if a revoked token is ever presented again, the token was
 * stolen (or replayed), and the whole family is revoked.
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    createdByIp: String,
    userAgent: String,
  },
  { timestamps: true, versionKey: false },
);

// MongoDB's TTL monitor deletes rows once they expire.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
