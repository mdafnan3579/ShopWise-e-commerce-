import { z } from 'zod';
import { ROLES } from '../config/catalog.js';
import { paginationQuery, sortQuery } from '../utils/pagination.js';
import { email, idParams, password, personName, searchTerm } from './common.js';

export const updateProfileSchema = {
  body: z
    .object({
      name: personName.optional(),
      email: email.optional(),
      currentPassword: z.string().min(1).max(200).optional(),
    })
    .refine((b) => b.name !== undefined || b.email !== undefined, {
      error: 'Provide at least one of name or email',
    })
    .refine((b) => b.email === undefined || b.currentPassword !== undefined, {
      error: 'currentPassword is required to change email',
      path: ['currentPassword'],
    }),
};

export const changePasswordSchema = {
  body: z
    .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
    .refine((b) => b.currentPassword !== b.newPassword, {
      error: 'New password must be different from the current password',
      path: ['newPassword'],
    }),
};

const addressFields = {
  label: z.string().trim().max(30).optional(),
  fullName: z.string().trim().min(2).max(80),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().min(2).max(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a 2-letter ISO country code (e.g. US)'),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d\s()-]{5,30}$/, 'Invalid phone number')
    .optional(),
  isDefault: z.boolean().optional(),
};

export const addressBody = z.object(addressFields);

export const createAddressSchema = { body: addressBody };

export const updateAddressSchema = {
  params: idParams('addressId'),
  body: addressBody
    .partial()
    .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' }),
};

export const addressIdSchema = { params: idParams('addressId') };

export const wishlistItemSchema = { params: idParams('productId') };

export const listUsersSchema = {
  query: z.object({
    ...paginationQuery,
    q: searchTerm.optional(),
    role: z.enum(ROLES).optional(),
    sort: sortQuery(['-createdAt', 'createdAt', 'name', '-name', 'email'], '-createdAt'),
  }),
};

export const updateRoleSchema = {
  params: idParams('id'),
  body: z.object({ role: z.enum(ROLES) }),
};
