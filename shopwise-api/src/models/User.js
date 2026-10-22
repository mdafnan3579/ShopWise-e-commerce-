import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { MAX_ADDRESSES, MAX_WISHLIST_ITEMS, ROLES } from '../config/catalog.js';
import { env } from '../config/env.js';

const { Schema } = mongoose;

const addressSchema = new Schema({
  label: { type: String, trim: true, maxlength: 30 },
  fullName: { type: String, required: true, trim: true, maxlength: 80 },
  line1: { type: String, required: true, trim: true, maxlength: 120 },
  line2: { type: String, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, trim: true, maxlength: 80 },
  postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
  phone: { type: String, trim: true, maxlength: 30 },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never selected unless explicitly requested with `.select('+password')`.
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    addresses: {
      type: [addressSchema],
      validate: {
        validator: (list) => list.length <= MAX_ADDRESSES,
        message: `A user can have at most ${MAX_ADDRESSES} addresses`,
      },
    },
    wishlist: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      validate: {
        validator: (list) => list.length <= MAX_WISHLIST_ITEMS,
        message: `A wishlist can hold at most ${MAX_WISHLIST_ITEMS} items`,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  },
);

userSchema.index({ createdAt: -1 });

// Hash on create and whenever the password changes.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);
});

/** @param {string} candidate */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model('User', userSchema);
