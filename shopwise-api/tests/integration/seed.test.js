import { describe, expect, it } from 'vitest';
import { Product } from '../../src/models/Product.js';
import { Review } from '../../src/models/Review.js';
import { User } from '../../src/models/User.js';
import { DEMO_ACCOUNTS, seedDatabase } from '../../src/scripts/seed.js';
import { SEED_PRODUCTS } from '../../src/scripts/seed-data/products.js';
import { productBody } from '../../src/validators/product.validators.js';

describe('seed data', () => {
  it('every seed product passes the same validation as the admin API', () => {
    for (const { quality: _quality, ...product } of SEED_PRODUCTS) {
      const result = productBody.safeParse(product);
      expect(result.success, `${product.name}: ${result.error?.message}`).toBe(true);
    }
  });

  it('seeds 40+ products across 6+ categories with reviews and demo accounts', async () => {
    const summary = await seedDatabase();

    expect(summary.products).toBeGreaterThanOrEqual(40);
    expect(summary.categories).toBeGreaterThanOrEqual(6);

    const admin = await User.findOne({ email: DEMO_ACCOUNTS.admin.email }).select('+password');
    expect(admin.role).toBe('admin');
    expect(await admin.comparePassword(DEMO_ACCOUNTS.admin.password)).toBe(true);

    // Ratings are denormalized correctly and plenty of products qualify for AI summaries.
    const withEnoughReviews = await Product.countDocuments({ reviewCount: { $gte: 3 } });
    expect(withEnoughReviews).toBeGreaterThan(30);
    const sample = await Product.findOne({ reviewCount: { $gte: 3 } });
    expect(await Review.countDocuments({ product: sample._id })).toBe(sample.reviewCount);

    // Some low-stock items for the admin dashboard.
    expect(await Product.countDocuments({ stock: { $lte: 5 } })).toBeGreaterThan(3);
  }, 30_000);

  it('is idempotent', async () => {
    await seedDatabase();
    const first = await Product.countDocuments();
    await seedDatabase();
    expect(await Product.countDocuments()).toBe(first);
  }, 30_000);
});
