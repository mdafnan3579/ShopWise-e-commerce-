import mongoose from 'mongoose';
import { MAX_CART_LINES, MAX_QUANTITY_PER_ITEM } from '../config/commerce.js';

const { Schema } = mongoose;

/**
 * A logged-in user's saved cart, so it follows them across devices. It stores only product
 * references and quantities. Prices are always recomputed from the catalog when read, so a
 * stored cart can never carry a stale or tampered price.
 */
const cartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: {
      type: [
        new Schema(
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            quantity: { type: Number, required: true, min: 1, max: MAX_QUANTITY_PER_ITEM },
          },
          { _id: false },
        ),
      ],
      validate: [(items) => items.length <= MAX_CART_LINES, `At most ${MAX_CART_LINES} items`],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);

export const Cart = mongoose.model('Cart', cartSchema);
