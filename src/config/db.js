import mongoose from 'mongoose';
import { logger } from './logger.js';

// Reject query filters on fields that are not in the schema instead of silently ignoring them.
mongoose.set('strictQuery', true);

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

/**
 * @param {string} uri
 * @param {import('mongoose').ConnectOptions} [options]
 */
export async function connectDB(uri, options = {}) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, ...options });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export function isDBConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
