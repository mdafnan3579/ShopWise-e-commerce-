import { Router } from 'express';
import * as users from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  addressIdSchema,
  changePasswordSchema,
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
  wishlistItemSchema,
} from '../validators/user.validators.js';

export function createUserRouter() {
  const router = Router();
  router.use(requireAuth);

  router.patch('/me', validate(updateProfileSchema), users.updateProfile);
  router.patch('/me/password', validate(changePasswordSchema), users.changePassword);

  router.get('/me/addresses', users.listAddresses);
  router.post('/me/addresses', validate(createAddressSchema), users.addAddress);
  router.patch('/me/addresses/:addressId', validate(updateAddressSchema), users.updateAddress);
  router.delete('/me/addresses/:addressId', validate(addressIdSchema), users.deleteAddress);

  router.get('/me/wishlist', users.getWishlist);
  router.post('/me/wishlist/:productId', validate(wishlistItemSchema), users.addToWishlist);
  router.delete('/me/wishlist/:productId', validate(wishlistItemSchema), users.removeFromWishlist);

  return router;
}
