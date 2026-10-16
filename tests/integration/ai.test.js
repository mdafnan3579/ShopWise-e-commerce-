import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/config/logger.js';
import { ChatSession } from '../../src/models/ChatSession.js';
import { Order } from '../../src/models/Order.js';
import { Product } from '../../src/models/Product.js';
import { RecommendationCache } from '../../src/models/RecommendationCache.js';
import { Review } from '../../src/models/Review.js';
import {
  fakeAnthropic,
  jsonResponse,
  textResponse,
  toolUseResponse,
} from '../helpers/fakeAnthropic.js';
import { createProduct, createTestApp, createUser, loginAs } from '../helpers/index.js';

const app = createTestApp();
const aiError = () => new Error('upstream AI failure');

afterEach(() => {
  vi.restoreAllMocks();
  expect(fakeAnthropic.pending()).toBe(0); // every scripted response was consumed
});

/** Collects a Server-Sent Events response into `[{ event, data }]`. */
function sse(req) {
  return req.buffer(true).parse((res, callback) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => (raw += chunk));
    res.on('end', () => {
      const events = raw
        .split('\n\n')
        .filter((block) => block.startsWith('event:'))
        .map((block) => {
          const [eventLine, dataLine] = block.split('\n');
          return { event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) };
        });
      callback(null, events);
    });
  });
}

const textOf = (events) =>
  events
    .filter((e) => e.event === 'text')
    .map((e) => e.data.delta)
    .join('');

describe('POST /api/v1/ai/search (natural language search)', () => {
  async function seedShoes() {
    return Promise.all([
      createProduct({
        name: 'Stride Trail Runner GTX',
        category: 'shoes',
        priceCents: 8999,
        averageRating: 4.6,
        tags: ['waterproof', 'running'],
      }),
      createProduct({
        name: 'Waterproof Running Racer',
        category: 'shoes',
        priceCents: 14999,
        averageRating: 4.8,
        tags: ['waterproof', 'running'],
      }),
      createProduct({
        name: 'Budget Running Shoe',
        category: 'shoes',
        priceCents: 4999,
        averageRating: 3.2,
      }),
      createProduct({
        name: 'Waterproof Jacket',
        category: 'clothing',
        priceCents: 7999,
        averageRating: 4.5,
      }),
    ]);
  }

  it('turns a sentence into filters, runs a normal query and returns removable chips', async () => {
    await seedShoes();
    fakeAnthropic.enqueue(
      toolUseResponse([
        {
          name: 'apply_search_filters',
          input: { keywords: 'waterproof running', category: 'shoes', maxPrice: 100, minRating: 4 },
        },
      ]),
    );

    const res = await request(app)
      .post('/api/v1/ai/search')
      .send({ query: 'waterproof running shoes under $100 with good reviews' });

    expect(res.status).toBe(200);
    expect(res.body.data.products.map((p) => p.name)).toEqual(['Stride Trail Runner GTX']);
    expect(res.body.data).toMatchObject({
      fallback: false,
      interpretedFilters: { category: 'shoes', maxPrice: 100, minRating: 4 },
      summary: 'Showing results for: “waterproof running”, Shoes, Under $100, 4+ stars',
    });
    expect(res.body.data.chips.map((c) => c.key)).toEqual([
      'keywords',
      'category',
      'maxPrice',
      'minRating',
    ]);

    const [params] = fakeAnthropic.messages.create.mock.calls[0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.tool_choice).toEqual({ type: 'auto' });
    expect(params.tools[0]).toMatchObject({ name: 'apply_search_filters', strict: true });
    expect(params.max_tokens).toBeLessThanOrEqual(512);
    expect(params.messages[0].content).toContain('<search_request>');
  });

  it('falls back to plain text search when the AI call fails', async () => {
    await seedShoes();
    fakeAnthropic.enqueue(aiError());

    const res = await request(app).post('/api/v1/ai/search').send({ query: 'waterproof' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fallback: true, interpretedFilters: null, chips: [] });
    expect(res.body.data.products.length).toBeGreaterThan(0);
  });

  it('falls back when the model answers without calling the tool or with invalid filters', async () => {
    await seedShoes();
    fakeAnthropic.enqueue(
      textResponse('I think you want shoes!'),
      toolUseResponse([{ name: 'apply_search_filters', input: { category: 'spaceships' } }]),
    );

    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post('/api/v1/ai/search').send({ query: 'shoes' });
      expect(res.body.data.fallback).toBe(true);
    }
  });

  it('relaxes keywords when keywords plus filters match nothing', async () => {
    await seedShoes();
    fakeAnthropic.enqueue(
      toolUseResponse([
        {
          name: 'apply_search_filters',
          input: { keywords: 'gore-tex zebra', category: 'clothing' },
        },
      ]),
    );

    const res = await request(app)
      .post('/api/v1/ai/search')
      .send({ query: 'zebra gore-tex clothes' });
    expect(res.body.data.relaxed).toBe(true);
    expect(res.body.data.products.map((p) => p.name)).toEqual(['Waterproof Jacket']);
  });

  it('enforces input length limits and its own rate limit', async () => {
    const tooLong = await request(app)
      .post('/api/v1/ai/search')
      .send({ query: 'x'.repeat(201) });
    expect(tooLong.status).toBe(400);

    const limited = createTestApp({ aiSearch: 1 });
    fakeAnthropic.enqueue(aiError());
    await request(limited).post('/api/v1/ai/search').send({ query: 'shoes' }).expect(200);
    const blocked = await request(limited).post('/api/v1/ai/search').send({ query: 'shoes' });
    expect(blocked.status).toBe(429);
  });

  it('logs token usage for every AI call', async () => {
    const info = vi.spyOn(logger, 'info');
    fakeAnthropic.enqueue(
      toolUseResponse([{ name: 'apply_search_filters', input: { category: 'books' } }]),
    );

    await request(app).post('/api/v1/ai/search').send({ query: 'books' });

    const usageLog = info.mock.calls.find(([, msg]) => msg === 'AI usage');
    expect(usageLog[0].ai).toMatchObject({
      feature: 'nl_search',
      inputTokens: 120,
      outputTokens: 40,
    });
  });
});

describe('GET /api/v1/products/:id/review-summary', () => {
  async function productWithReviews(count) {
    const product = await createProduct();
    for (let i = 0; i < count; i += 1) {
      const user = await createUser();
      await Review.create({
        user: user._id,
        product: product._id,
        rating: 4,
        comment: 'Comfortable and well made, battery lasts all day.',
      });
    }
    await Review.recalculateProductRating(product._id);
    return product;
  }

  const summary = {
    summary: 'Reviewers love the comfort and battery life.',
    pros: ['Comfortable', 'Long battery life'],
    cons: ['Pricey'],
  };

  it('requires at least 3 reviews and makes no AI call below that', async () => {
    const product = await productWithReviews(2);
    const res = await request(app).get(`/api/v1/products/${product._id}/review-summary`);
    expect(res.body.data).toEqual({
      status: 'insufficient_reviews',
      reviewCount: 2,
      minReviews: 3,
    });
    expect(fakeAnthropic.messages.create).not.toHaveBeenCalled();
  });

  it('generates with the fast model, labels it AI-generated, and caches it on the product', async () => {
    const product = await productWithReviews(3);
    fakeAnthropic.enqueue(jsonResponse(summary));

    const first = await request(app).get(`/api/v1/products/${product._id}/review-summary`);
    expect(first.body.data).toMatchObject({
      status: 'ready',
      aiGenerated: true,
      cached: false,
      ...summary,
    });

    const [params] = fakeAnthropic.messages.create.mock.calls[0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.messages[0].content).toContain('<reviews>');

    const second = await request(app).get(`/api/v1/products/${product._id}/review-summary`);
    expect(second.body.data.cached).toBe(true);
    expect(fakeAnthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('regenerates only when reviews changed AND the cache is older than 24 hours', async () => {
    const product = await productWithReviews(3);
    const recent = { ...summary, generatedAt: new Date(Date.now() - 60 * 60 * 1000) };
    await Product.updateOne(
      { _id: product._id },
      { aiReviewSummary: recent, reviewsUpdatedAt: new Date() },
    );

    // Reviews changed, but the cache is only 1 hour old: serve the cache.
    const fresh = await request(app).get(`/api/v1/products/${product._id}/review-summary`);
    expect(fresh.body.data.cached).toBe(true);

    await Product.updateOne(
      { _id: product._id },
      { 'aiReviewSummary.generatedAt': new Date(Date.now() - 48 * 60 * 60 * 1000) },
    );
    fakeAnthropic.enqueue(jsonResponse({ ...summary, summary: 'Updated summary.' }));
    const regenerated = await request(app).get(`/api/v1/products/${product._id}/review-summary`);
    expect(regenerated.body.data).toMatchObject({ cached: false, summary: 'Updated summary.' });
  });

  it('degrades gracefully: stale cache if present, otherwise status unavailable', async () => {
    const withoutCache = await productWithReviews(3);
    fakeAnthropic.enqueue(aiError());
    const none = await request(app).get(`/api/v1/products/${withoutCache._id}/review-summary`);
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual({ status: 'unavailable' });

    const withCache = await productWithReviews(3);
    await Product.updateOne(
      { _id: withCache._id },
      {
        aiReviewSummary: { ...summary, generatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000) },
        reviewsUpdatedAt: new Date(),
      },
    );
    fakeAnthropic.enqueue(jsonResponse({ unexpected: 'shape' }));
    const stale = await request(app).get(`/api/v1/products/${withCache._id}/review-summary`);
    expect(stale.body.data).toMatchObject({
      status: 'ready',
      stale: true,
      summary: summary.summary,
    });
  });
});

describe('POST /api/v1/ai/admin/generate-description', () => {
  const input = {
    name: 'Aurora ANC Headphones',
    category: 'electronics',
    features: ['40h battery', 'Adaptive noise cancelling', 'Foldable'],
  };

  it('returns validated, normalized copy for admins', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    fakeAnthropic.enqueue(
      jsonResponse({
        description: 'Immersive sound for travel. '.repeat(10),
        tagline: 'Silence the world.',
        tags: ['Noise Cancelling', 'wireless', 'wireless', 'Travel Gear'],
      }),
    );

    const res = await agent.post('/api/v1/ai/admin/generate-description').send(input);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tagline: 'Silence the world',
      tags: ['noise-cancelling', 'wireless', 'travel-gear'],
      aiGenerated: true,
    });
    const [params] = fakeAnthropic.messages.create.mock.calls[0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params).toMatchObject({
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
  });

  it('is admin-only and validates input', async () => {
    const { agent } = await loginAs(app);
    expect((await agent.post('/api/v1/ai/admin/generate-description').send(input)).status).toBe(
      403,
    );

    const admin = await loginAs(app, { role: 'admin' });
    const bad = await admin.agent
      .post('/api/v1/ai/admin/generate-description')
      .send({ ...input, features: [] });
    expect(bad.status).toBe(400);
  });

  it('returns 503 AI_UNAVAILABLE when the AI fails or refuses', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    fakeAnthropic.enqueue(aiError(), textResponse('', { stop_reason: 'refusal' }));

    for (let i = 0; i < 2; i += 1) {
      const res = await agent.post('/api/v1/ai/admin/generate-description').send(input);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    }
  });
});

describe('GET /api/v1/ai/recommendations', () => {
  it('returns top-rated products to guests without calling the AI', async () => {
    await createProduct({ averageRating: 4.9, name: 'Best' });
    await createProduct({ averageRating: 2.0, name: 'Worst' });

    const res = await request(app).get('/api/v1/ai/recommendations');
    expect(res.body.data.source).toBe('top_rated');
    expect(res.body.data.items[0]).toMatchObject({ product: { name: 'Best' }, reason: null });
    expect(fakeAnthropic.messages.create).not.toHaveBeenCalled();
  });

  async function shopperWithHistory() {
    const { agent, user } = await loginAs(app);
    const bought = await createProduct({ category: 'shoes', name: 'Bought Shoe' });
    const candidates = await Promise.all(
      ['Trail Sock', 'Running Shoe', 'Rain Shoe'].map((name) =>
        createProduct({ category: 'shoes', name }),
      ),
    );
    await Order.create({
      user: user._id,
      items: [
        {
          product: bought._id,
          name: bought.name,
          priceCents: 1000,
          quantity: 1,
          lineTotalCents: 1000,
        },
      ],
      shippingAddress: { fullName: 'A B', line1: 'x', city: 'y', postalCode: '123', country: 'US' },
      subtotalCents: 1000,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 1000,
      paymentStatus: 'paid',
      orderStatus: 'paid',
      paidAt: new Date(),
    });
    return { agent, user, bought, candidates };
  }

  it('ranks candidates with reasons, drops ungrounded ids, never re-recommends purchases, and caches', async () => {
    const { agent, bought, candidates } = await shopperWithHistory();
    fakeAnthropic.enqueue(
      jsonResponse({
        recommendations: [
          { productId: String(candidates[1]._id), reason: 'Pairs with the shoes you bought.' },
          { productId: 'ffffffffffffffffffffffff', reason: 'Hallucinated product' },
          { productId: String(bought._id), reason: 'Already owned' },
        ],
      }),
    );

    const res = await agent.get('/api/v1/ai/recommendations');

    expect(res.body.data.source).toBe('ai');
    expect(res.body.data.items).toEqual([
      expect.objectContaining({
        product: expect.objectContaining({ name: 'Running Shoe' }),
        reason: 'Pairs with the shoes you bought.',
      }),
    ]);
    const [params] = fakeAnthropic.messages.create.mock.calls[0];
    expect(params.messages[0].content).not.toContain(String(bought._id));

    const again = await agent.get('/api/v1/ai/recommendations');
    expect(again.body.data.cached).toBe(true);
    expect(fakeAnthropic.messages.create).toHaveBeenCalledTimes(1);
    expect(await RecommendationCache.countDocuments()).toBe(1);
  });

  it('falls back to rating-sorted candidates when the AI fails', async () => {
    const { agent } = await shopperWithHistory();
    fakeAnthropic.enqueue(aiError());

    const res = await agent.get('/api/v1/ai/recommendations');
    expect(res.body.data.source).toBe('fallback');
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items.every((i) => i.reason === null)).toBe(true);
    expect(await RecommendationCache.countDocuments()).toBe(0);
  });
});

describe('POST /api/v1/ai/chat (SSE shopping assistant)', () => {
  it('streams text, runs tools against the database, and returns grounded product cards', async () => {
    const shoe = await createProduct({
      name: 'Stride Trail Runner GTX',
      category: 'shoes',
      tags: ['trail'],
    });
    fakeAnthropic.enqueue(
      toolUseResponse([{ name: 'search_products', input: { query: 'trail', category: 'shoes' } }], {
        text: 'Let me check our trail shoes.',
      }),
      (params) => {
        // The tool result sent back to the model contains real catalog data.
        const toolResult = params.messages.at(-1).content[0];
        expect(JSON.parse(toolResult.content).products[0]).toMatchObject({
          id: String(shoe._id),
          name: 'Stride Trail Runner GTX',
          price: '$19.99',
        });
        return toolUseResponse([
          {
            name: 'show_products',
            input: { productIds: [String(shoe._id), 'ffffffffffffffffffffffff'] },
          },
        ]);
      },
      textResponse('The **Stride Trail Runner GTX** is a great pick.'),
    );

    const res = await sse(request(app).post('/api/v1/ai/chat').send({ message: 'Trail shoes?' }));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = res.body;
    const names = events.map((e) => e.event);
    expect(names[0]).toBe('session');
    expect(names.at(-1)).toBe('done');
    expect(events.filter((e) => e.event === 'tool').map((e) => e.data.name)).toEqual([
      'search_products',
      'show_products',
    ]);
    expect(textOf(events)).toBe(
      'Let me check our trail shoes.\n\nThe **Stride Trail Runner GTX** is a great pick.',
    );

    // Only the id that came back from a catalog tool is shown; the invented one is dropped.
    const products = events.find((e) => e.event === 'products').data.products;
    expect(products.map((p) => p.name)).toEqual(['Stride Trail Runner GTX']);

    const stored = await ChatSession.findById(events[0].data.sessionId);
    expect(stored.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(stored.messages[1].productIds.map(String)).toEqual([String(shoe._id)]);
    expect(stored.guestId).toBeTruthy();

    // Chat uses the main model, low effort, cached system prompt, and every tool.
    const [params] = fakeAnthropic.messages.stream.mock.calls[0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.tools.map((t) => t.name)).toEqual([
      'search_products',
      'get_product_details',
      'compare_products',
      'check_stock',
      'show_products',
    ]);
  });

  it('continues an existing conversation with its history', async () => {
    const { agent } = await loginAs(app);
    fakeAnthropic.enqueue(textResponse('Hi! What are you shopping for?'), textResponse('Sure.'));

    const first = await sse(agent.post('/api/v1/ai/chat').send({ message: 'Hello' }));
    const sessionId = first.body[0].data.sessionId;
    await sse(agent.post('/api/v1/ai/chat').send({ message: 'Show me books', sessionId }));

    const [params] = fakeAnthropic.messages.stream.mock.calls[1];
    expect(params.messages.map((m) => m.content)).toEqual([
      'Hello',
      'Hi! What are you shopping for?',
      'Show me books',
    ]);

    const history = await agent.get(`/api/v1/ai/chat/sessions/${sessionId}`);
    expect(history.body.data.messages).toHaveLength(4);
  });

  it('keeps sessions private to their owner', async () => {
    const owner = await loginAs(app);
    const stranger = await loginAs(app);
    fakeAnthropic.enqueue(textResponse('Hello!'));
    const first = await sse(owner.agent.post('/api/v1/ai/chat').send({ message: 'Hi' }));
    const sessionId = first.body[0].data.sessionId;

    const res = await stranger.agent.post('/api/v1/ai/chat').send({ message: 'Hi', sessionId });
    expect(res.status).toBe(404);
    expect((await stranger.agent.get(`/api/v1/ai/chat/sessions/${sessionId}`)).status).toBe(404);
  });

  it('falls back to top-rated products when the AI is unavailable', async () => {
    await createProduct({ name: 'Crowd Favourite', averageRating: 4.9 });
    fakeAnthropic.enqueue(aiError());

    const res = await sse(request(app).post('/api/v1/ai/chat').send({ message: 'Help me shop' }));
    const events = res.body;

    expect(events.find((e) => e.event === 'error').data.code).toBe('AI_UNAVAILABLE');
    expect(textOf(events)).toMatch(/assistant is unavailable/);
    expect(events.find((e) => e.event === 'products').data.products[0].name).toBe(
      'Crowd Favourite',
    );
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { fallback: true } });
  });

  it('handles refusals politely', async () => {
    fakeAnthropic.enqueue(textResponse('', { stop_reason: 'refusal' }));
    const res = await sse(request(app).post('/api/v1/ai/chat').send({ message: 'Write my essay' }));
    expect(textOf(res.body)).toMatch(/can't help with that/);
  });

  it('reports invalid tool input back to the model instead of crashing', async () => {
    fakeAnthropic.enqueue(
      toolUseResponse([{ name: 'get_product_details', input: { productId: 'DROP TABLE' } }]),
      (params) => {
        const result = params.messages.at(-1).content[0];
        expect(result.is_error).toBe(true);
        return textResponse('Sorry, I could not find that product.');
      },
    );
    const res = await sse(request(app).post('/api/v1/ai/chat').send({ message: 'Details?' }));
    expect(textOf(res.body)).toBe('Sorry, I could not find that product.');
  });

  it('validates message length', async () => {
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({ message: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });
});
