/**
 * Seeds a development database with demo users, a 48-product catalog and sample reviews.
 *
 *   npm run seed            (refuses to run with NODE_ENV=production unless --force is passed)
 *
 * The data is generated with a fixed-seed PRNG, so every run produces the same database.
 */
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Cart } from '../models/Cart.js';
import { Coupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { ProcessedWebhookEvent } from '../models/ProcessedWebhookEvent.js';
import { Product } from '../models/Product.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Review } from '../models/Review.js';
import { User } from '../models/User.js';
import { SEED_PRODUCTS, placeholderImage } from './seed-data/products.js';
import { REVIEWER_NAMES, REVIEW_TEMPLATES } from './seed-data/reviews.js';
import { slugify } from '../utils/slugify.js';

export const DEMO_ACCOUNTS = {
  admin: {
    name: 'Avery Admin',
    email: 'admin@shopwise.dev',
    password: 'Admin@12345',
    role: 'admin',
  },
  customer: { name: 'Demo Customer', email: 'demo@shopwise.dev', password: 'Demo@12345' },
};

/** Small deterministic PRNG (mulberry32) so seeds are reproducible. */
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rating centered on the product's quality with some spread, clamped to 1–5. */
function sampleRating(quality, random) {
  const noise = (random() + random() + random() - 1.5) * 1.6;
  return Math.min(5, Math.max(1, Math.round(quality + noise)));
}

/** Collections the seed owns (wiped on every run). */
export const SEEDED_MODELS = [
  User,
  Product,
  Review,
  RefreshToken,
  Order,
  Coupon,
  Cart,
  ProcessedWebhookEvent,
];

const DAY_MS = 24 * 60 * 60 * 1000;

export const SEED_COUPONS = [
  {
    code: 'WELCOME10',
    description: '10% off your order (max $50)',
    discountType: 'percent',
    value: 10,
    maxDiscountCents: 5000,
  },
  {
    code: 'SAVE20',
    description: '$20 off orders over $100',
    discountType: 'fixed',
    value: 2000,
    minSubtotalCents: 10000,
  },
  {
    code: 'FLASH25',
    description: '25% off, first 100 orders',
    discountType: 'percent',
    value: 25,
    usageLimit: 100,
    expiresAt: new Date(Date.now() + 30 * DAY_MS),
  },
  {
    code: 'SUMMER15',
    description: 'Expired summer promotion',
    discountType: 'percent',
    value: 15,
    expiresAt: new Date(Date.now() - 30 * DAY_MS),
  },
];

export async function seedDatabase() {
  const random = createRandom(42);

  await Promise.all(SEEDED_MODELS.map((model) => model.deleteMany({})));

  // `create` (not insertMany) so the password-hashing hook runs.
  const admin = await User.create(DEMO_ACCOUNTS.admin);
  const customer = await User.create({
    ...DEMO_ACCOUNTS.customer,
    addresses: [
      {
        label: 'Home',
        fullName: 'Demo Customer',
        line1: '221B Baker Street',
        city: 'London',
        postalCode: 'NW1 6XE',
        country: 'GB',
        isDefault: true,
      },
    ],
  });
  const reviewers = await User.create(
    REVIEWER_NAMES.map((name) => ({
      name,
      email: `${slugify(name).replace(/-/g, '.')}@example.com`,
      password: 'Reviewer@12345',
    })),
  );

  const products = await Product.insertMany(
    SEED_PRODUCTS.map(({ quality: _quality, ...product }) => ({
      ...product,
      slug: slugify(product.name),
      images: [placeholderImage(product)],
    })),
  );

  const reviews = [];
  products.forEach((product, index) => {
    const { quality } = SEED_PRODUCTS[index];
    // Most products get 3–8 reviews (enough for AI summaries); a few get fewer.
    const count = index % 7 === 0 ? Math.floor(random() * 3) : 3 + Math.floor(random() * 6);
    const shuffled = [...reviewers].sort(() => random() - 0.5).slice(0, count);

    for (const reviewer of shuffled) {
      const rating = sampleRating(quality, random);
      const pool = REVIEW_TEMPLATES[rating];
      const [title, comment] = pool[Math.floor(random() * pool.length)];
      const daysAgo = Math.floor(random() * 120);
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      reviews.push({
        user: reviewer._id,
        product: product._id,
        rating,
        title,
        comment,
        createdAt,
        updatedAt: createdAt,
      });
    }
  });

  await Review.insertMany(reviews, { timestamps: false });
  await Promise.all(products.map((p) => Review.recalculateProductRating(p._id)));

  // Seed a wishlist so the demo account is not empty.
  customer.wishlist = products.slice(0, 4).map((p) => p._id);
  await customer.save();

  await Coupon.insertMany(SEED_COUPONS);

  return {
    users: 2 + reviewers.length,
    products: products.length,
    categories: new Set(products.map((p) => p.category)).size,
    reviews: reviews.length,
    coupons: SEED_COUPONS.length,
    admin: admin.email,
  };
}

async function main() {
  if (env.isProduction && !process.argv.includes('--force')) {
    logger.error('Refusing to seed a production database. Pass --force if you really mean it.');
    process.exitCode = 1;
    return;
  }

  await connectDB(env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const summary = await seedDatabase();
  logger.info(summary, 'Database seeded');
  logger.info(
    `Demo logins → admin: ${DEMO_ACCOUNTS.admin.email} / ${DEMO_ACCOUNTS.admin.password}, ` +
      `customer: ${DEMO_ACCOUNTS.customer.email} / ${DEMO_ACCOUNTS.customer.password}`,
  );
}

// Run only when executed directly (`node src/scripts/seed.js`), not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      logger.fatal({ err }, 'Seeding failed');
      process.exitCode = 1;
    })
    .finally(() => disconnectDB());
}
