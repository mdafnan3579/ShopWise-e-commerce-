import { MAX_ADDRESSES, MAX_WISHLIST_ITEMS } from '../config/catalog.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { paginate, toMongoSort } from '../utils/pagination.js';
import { escapeRegex } from '../utils/regex.js';
import { revokeAllUserTokens } from './token.service.js';

/** Fields that make up a product card (wishlist, recommendations, chat). */
export const PRODUCT_CARD_FIELDS =
  'name slug tagline priceCents category brand images averageRating reviewCount stock isActive';

/**
 * Explicit allow-list of fields returned to clients, so new sensitive fields added to the model
 * are never exposed by accident.
 */
export function toPublicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    addresses: user.addresses ?? [],
    wishlist: user.wishlist ?? [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function findUserOrThrow(userId, select) {
  const query = User.findById(userId);
  if (select) query.select(select);
  const user = await query;
  if (!user) throw AppError.notFound('User');
  return user;
}

export async function getUserById(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw AppError.notFound('User');
  return user;
}

/** @param {{ name?: string, email?: string, currentPassword?: string }} changes */
export async function updateProfile(userId, { name, email, currentPassword }) {
  const user = await findUserOrThrow(userId, '+password');

  if (email !== undefined && email !== user.email) {
    if (!(await user.comparePassword(currentPassword))) {
      throw AppError.unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');
    }
    if (await User.exists({ email, _id: { $ne: user._id } })) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
    }
    user.email = email;
  }
  if (name !== undefined) user.name = name;

  await user.save();
  return user;
}

/**
 * Changes the password and revokes every refresh token, logging out all other devices.
 * The controller then starts a fresh session for the current device.
 */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await findUserOrThrow(userId, '+password');

  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  user.password = newPassword;
  await user.save();
  await revokeAllUserTokens(user._id);
  return user;
}

// --- Addresses --------------------------------------------------------------

function clearDefault(addresses) {
  for (const address of addresses) address.isDefault = false;
}

export async function listAddresses(userId) {
  const user = await findUserOrThrow(userId);
  return user.addresses;
}

export async function addAddress(userId, data) {
  const user = await findUserOrThrow(userId);

  if (user.addresses.length >= MAX_ADDRESSES) {
    throw new AppError(`You can save at most ${MAX_ADDRESSES} addresses`, 400, 'ADDRESS_LIMIT');
  }

  // The first address is always the default.
  const makeDefault = data.isDefault === true || user.addresses.length === 0;
  if (makeDefault) clearDefault(user.addresses);
  user.addresses.push({ ...data, isDefault: makeDefault });

  await user.save();
  return user.addresses;
}

export async function updateAddress(userId, addressId, changes) {
  const user = await findUserOrThrow(userId);
  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address');

  if (changes.isDefault === true) clearDefault(user.addresses);
  // Unsetting the only default is ignored: one address must stay the default.
  const { isDefault, ...rest } = changes;
  address.set(rest);
  if (isDefault === true) address.isDefault = true;

  await user.save();
  return user.addresses;
}

export async function deleteAddress(userId, addressId) {
  const user = await findUserOrThrow(userId);
  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address');

  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;

  await user.save();
  return user.addresses;
}

// --- Wishlist ---------------------------------------------------------------

export async function getWishlist(userId) {
  const user = await User.findById(userId)
    .select('wishlist')
    .populate({ path: 'wishlist', select: PRODUCT_CARD_FIELDS, match: { isActive: true } })
    .lean();
  if (!user) throw AppError.notFound('User');
  return user.wishlist.filter(Boolean);
}

export async function addToWishlist(userId, productId) {
  const product = await Product.exists({ _id: productId, isActive: true });
  if (!product) throw AppError.notFound('Product');

  // Atomic, idempotent add with the size cap enforced in the same query.
  const updated = await User.findOneAndUpdate(
    { _id: userId, [`wishlist.${MAX_WISHLIST_ITEMS - 1}`]: { $exists: false } },
    { $addToSet: { wishlist: productId } },
  );
  if (!updated) {
    if (!(await User.exists({ _id: userId }))) throw AppError.notFound('User');
    throw new AppError(
      `Your wishlist can hold at most ${MAX_WISHLIST_ITEMS} items`,
      400,
      'WISHLIST_LIMIT',
    );
  }
  return getWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  const result = await User.updateOne({ _id: userId }, { $pull: { wishlist: productId } });
  if (result.matchedCount === 0) throw AppError.notFound('User');
  return getWishlist(userId);
}

// --- Admin ------------------------------------------------------------------

export async function listUsers({ page, limit, q, role, sort }) {
  const filter = {};
  if (role) filter.role = role;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  return paginate(User, {
    filter,
    sort: toMongoSort(sort),
    page,
    limit,
    projection: 'name email role createdAt updatedAt',
  });
}

export async function updateUserRole(actorId, targetId, role) {
  if (String(actorId) === String(targetId)) {
    throw new AppError('You cannot change your own role', 400, 'CANNOT_CHANGE_OWN_ROLE');
  }
  const user = await User.findByIdAndUpdate(
    targetId,
    { role },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!user) throw AppError.notFound('User');

  // Force re-login so the new role takes effect immediately on refresh.
  await revokeAllUserTokens(user._id);
  return user;
}
