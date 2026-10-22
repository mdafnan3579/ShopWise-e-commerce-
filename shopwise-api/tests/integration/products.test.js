import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Product } from '../../src/models/Product.js';
import { createProduct, createTestApp, loginAs } from '../helpers/index.js';

vi.mock('../../src/services/upload.service.js', () => ({
  uploadProductImage: vi.fn(async () => ({
    url: `https://res.cloudinary.com/demo/image/upload/${Math.random()}.jpg`,
    publicId: `shopwise/products/${Math.random()}`,
  })),
  deleteImage: vi.fn(async () => {}),
  isUploadConfigured: () => true,
}));

const uploadService = await import('../../src/services/upload.service.js');
const app = createTestApp();

const validProduct = {
  name: 'Aurora Wireless Headphones',
  description: 'Over-ear wireless headphones with active noise cancellation and 40h battery.',
  priceCents: 19999,
  category: 'electronics',
  brand: 'Sonora',
  tags: ['Wireless', 'noise-cancelling'],
  stock: 25,
};

describe('GET /api/v1/products', () => {
  beforeEach(async () => {
    await Promise.all([
      createProduct({
        name: 'Trail Runner GTX',
        category: 'shoes',
        brand: 'Stride',
        priceCents: 8999,
        averageRating: 4.6,
        tags: ['waterproof', 'running'],
        stock: 3,
      }),
      createProduct({
        name: 'Road Racer',
        category: 'shoes',
        brand: 'Stride',
        priceCents: 12999,
        averageRating: 4.1,
        tags: ['running'],
      }),
      createProduct({
        name: 'Waterproof Hiking Jacket',
        category: 'clothing',
        brand: 'Northpeak',
        priceCents: 15999,
        averageRating: 3.5,
        tags: ['waterproof'],
        stock: 0,
      }),
      createProduct({ name: 'Hidden Prototype', category: 'shoes', isActive: false }),
    ]);
  });

  it('lists active products with pagination meta and without heavy fields', async () => {
    const res = await request(app).get('/api/v1/products?limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.data[0]).not.toHaveProperty('description');
  });

  it('filters by category, price range, rating, stock and tags', async () => {
    const byCategory = await request(app).get('/api/v1/products?category=shoes');
    expect(byCategory.body.data.map((p) => p.name).sort()).toEqual([
      'Road Racer',
      'Trail Runner GTX',
    ]);

    const byPrice = await request(app).get(
      '/api/v1/products?minPriceCents=9000&maxPriceCents=13000',
    );
    expect(byPrice.body.data.map((p) => p.name)).toEqual(['Road Racer']);

    const byRating = await request(app).get('/api/v1/products?minRating=4.5');
    expect(byRating.body.data.map((p) => p.name)).toEqual(['Trail Runner GTX']);

    const inStock = await request(app).get('/api/v1/products?inStock=true');
    expect(inStock.body.meta.total).toBe(2);

    const byTag = await request(app).get('/api/v1/products?tags=waterproof');
    expect(byTag.body.meta.total).toBe(2);
  });

  it('sorts by price and rating', async () => {
    const asc = await request(app).get('/api/v1/products?sort=price');
    expect(asc.body.data.map((p) => p.priceCents)).toEqual([8999, 12999, 15999]);

    const rating = await request(app).get('/api/v1/products?sort=-rating');
    expect(rating.body.data[0].name).toBe('Trail Runner GTX');
  });

  it('full-text searches with relevance and falls back to partial matches', async () => {
    const text = await request(app).get('/api/v1/products?q=waterproof');
    expect(text.body.meta.total).toBe(2);
    expect(text.body.data[0].name).toBe('Waterproof Hiking Jacket'); // name match ranks first

    const partial = await request(app).get('/api/v1/products?q=trai');
    expect(partial.body.data.map((p) => p.name)).toEqual(['Trail Runner GTX']);
  });

  it('rejects invalid filters', async () => {
    const res = await request(app).get(
      '/api/v1/products?category=weapons&sort=hacked&minPriceCents=500&maxPriceCents=100',
    );
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['query.category', 'query.sort']));
  });

  it('treats regex characters in search as literal text', async () => {
    const res = await request(app).get('/api/v1/products?q=.*');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/v1/products/categories', () => {
  it('returns every category with active product counts', async () => {
    await createProduct({ category: 'books' });
    await createProduct({ category: 'books', isActive: false });

    const res = await request(app).get('/api/v1/products/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toContainEqual({ slug: 'books', label: 'Books', productCount: 1 });
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);
  });
});

describe('GET /api/v1/products/:idOrSlug', () => {
  it('finds a product by id or slug with a rating breakdown', async () => {
    const product = await createProduct({ slug: 'trail-runner-gtx' });

    const byId = await request(app).get(`/api/v1/products/${product._id}`);
    const bySlug = await request(app).get('/api/v1/products/trail-runner-gtx');

    expect(byId.status).toBe(200);
    expect(bySlug.body.data._id).toBe(String(product._id));
    expect(byId.body.data.ratingBreakdown).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(byId.body.data.description).toBeDefined();
  });

  it('hides inactive products from customers but not from admins', async () => {
    const product = await createProduct({ isActive: false });
    expect((await request(app).get(`/api/v1/products/${product._id}`)).status).toBe(404);

    const { agent } = await loginAs(app, { role: 'admin' });
    expect((await agent.get(`/api/v1/products/${product._id}`)).status).toBe(200);
  });

  it('returns related products from the same category', async () => {
    const product = await createProduct({ category: 'books' });
    await createProduct({ category: 'books', name: 'Sibling Book' });
    await createProduct({ category: 'beauty' });

    const res = await request(app).get(`/api/v1/products/${product._id}/related`);
    expect(res.body.data.map((p) => p.name)).toEqual(['Sibling Book']);
  });
});

describe('admin product management', () => {
  it('forbids customers and guests from writing', async () => {
    const { agent } = await loginAs(app);
    expect((await agent.post('/api/v1/products').send(validProduct)).status).toBe(403);
    expect((await request(app).post('/api/v1/products').send(validProduct)).status).toBe(401);
  });

  it('creates products with a unique slug and normalized tags', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });

    const first = await agent.post('/api/v1/products').send(validProduct);
    const second = await agent.post('/api/v1/products').send(validProduct);

    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      slug: 'aurora-wireless-headphones',
      tags: ['wireless', 'noise-cancelling'],
      isActive: true,
    });
    expect(second.body.data.slug).toBe('aurora-wireless-headphones-2');
  });

  it('validates the body (integer cents, known category)', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const res = await agent
      .post('/api/v1/products')
      .send({ ...validProduct, priceCents: 19.99, category: 'weapons' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['body.priceCents', 'body.category']),
    );
  });

  it('updates and soft-deletes products', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const product = await createProduct();

    const updated = await agent.patch(`/api/v1/products/${product._id}`).send({ stock: 2 });
    expect(updated.body.data.stock).toBe(2);
    expect(updated.body.data.slug).toBe(product.slug); // slug stays stable

    expect((await agent.delete(`/api/v1/products/${product._id}`)).status).toBe(200);
    expect((await Product.findById(product._id)).isActive).toBe(false);
  });

  it('lists inactive and low-stock products for admins', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    await createProduct({ stock: 2 });
    await createProduct({ stock: 50, isActive: false });

    const all = await agent.get('/api/v1/admin/products');
    expect(all.body.meta.total).toBe(2);

    const lowStock = await agent.get('/api/v1/admin/products?lowStock=true');
    expect(lowStock.body.data.map((p) => p.stock)).toEqual([2]);

    const inactive = await agent.get('/api/v1/admin/products?status=inactive');
    expect(inactive.body.meta.total).toBe(1);
  });

  it('uploads images (multipart) and removes them', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const product = await createProduct();

    const upload = await agent
      .post(`/api/v1/products/${product._id}/images`)
      .attach('images', Buffer.from('fake-png'), { filename: 'a.png', contentType: 'image/png' })
      .attach('images', Buffer.from('fake-jpg'), { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(upload.status).toBe(201);
    expect(upload.body.data.images).toHaveLength(2);
    expect(uploadService.uploadProductImage).toHaveBeenCalledTimes(2);

    const imageId = upload.body.data.images[0]._id;
    const removed = await agent.delete(`/api/v1/products/${product._id}/images/${imageId}`);
    expect(removed.body.data.images).toHaveLength(1);
    expect(uploadService.deleteImage).toHaveBeenCalled();
  });

  it('rejects non-image uploads', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const product = await createProduct();

    const res = await agent
      .post(`/api/v1/products/${product._id}/images`)
      .attach('images', Buffer.from('MZ...'), {
        filename: 'evil.exe',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });
});
