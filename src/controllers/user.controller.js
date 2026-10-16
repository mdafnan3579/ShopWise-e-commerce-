import * as tokenService from '../services/token.service.js';
import * as userService from '../services/user.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { setAuthCookies } from '../utils/cookies.js';

export async function updateProfile(req, res) {
  const user = await userService.updateProfile(req.user.id, req.validated.body);
  sendSuccess(res, { data: { user: userService.toPublicUser(user) }, message: 'Profile updated' });
}

export async function changePassword(req, res) {
  const user = await userService.changePassword(req.user.id, req.validated.body);
  // All sessions were revoked; keep this device logged in with a fresh session.
  setAuthCookies(
    res,
    await tokenService.createSession(user, {
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 200),
    }),
  );
  sendSuccess(res, { message: 'Password changed. Other devices have been signed out.' });
}

export async function listAddresses(req, res) {
  sendSuccess(res, { data: { addresses: await userService.listAddresses(req.user.id) } });
}

export async function addAddress(req, res) {
  const addresses = await userService.addAddress(req.user.id, req.validated.body);
  sendCreated(res, { data: { addresses }, message: 'Address added' });
}

export async function updateAddress(req, res) {
  const addresses = await userService.updateAddress(
    req.user.id,
    req.validated.params.addressId,
    req.validated.body,
  );
  sendSuccess(res, { data: { addresses }, message: 'Address updated' });
}

export async function deleteAddress(req, res) {
  const addresses = await userService.deleteAddress(req.user.id, req.validated.params.addressId);
  sendSuccess(res, { data: { addresses }, message: 'Address deleted' });
}

export async function getWishlist(req, res) {
  sendSuccess(res, { data: { items: await userService.getWishlist(req.user.id) } });
}

export async function addToWishlist(req, res) {
  const items = await userService.addToWishlist(req.user.id, req.validated.params.productId);
  sendSuccess(res, { data: { items }, message: 'Added to wishlist' });
}

export async function removeFromWishlist(req, res) {
  const items = await userService.removeFromWishlist(req.user.id, req.validated.params.productId);
  sendSuccess(res, { data: { items }, message: 'Removed from wishlist' });
}

// --- Admin ---

export async function listUsers(req, res) {
  const { items, meta } = await userService.listUsers(req.validated.query);
  sendSuccess(res, { data: items, meta });
}

export async function updateUserRole(req, res) {
  const user = await userService.updateUserRole(
    req.user.id,
    req.validated.params.id,
    req.validated.body.role,
  );
  sendSuccess(res, { data: { user: userService.toPublicUser(user) }, message: 'Role updated' });
}
