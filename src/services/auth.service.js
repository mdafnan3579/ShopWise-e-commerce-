import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

// When the email does not exist we still run a bcrypt comparison (same cost factor as real
// hashes), so response timing does not reveal which emails are registered.
let dummyHashPromise;
const getDummyHash = () =>
  (dummyHashPromise ??= bcrypt.hash(randomBytes(16).toString('hex'), env.BCRYPT_ROUNDS));

const invalidCredentials = () =>
  AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

/** @param {{ name: string, email: string, password: string }} input */
export async function register({ name, email, password }) {
  const exists = await User.exists({ email });
  if (exists) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
  }
  // `role` is never taken from input: every self-registered account is a customer.
  return User.create({ name, email, password });
}

/** @param {{ email: string, password: string }} input */
export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    await bcrypt.compare(password, await getDummyHash());
    throw invalidCredentials();
  }

  const matches = await user.comparePassword(password);
  if (!matches) throw invalidCredentials();

  return user;
}
