import { beforeEach, describe, expect, it } from 'vitest';
import { fieldErrors, toApiError } from '../src/lib/api.js';
import { parseSseBlock } from '../src/lib/chat.js';
import { formatPrice, stockLabel } from '../src/lib/format.js';
import { chipRemovalUrl } from '../src/lib/search.js';
import { useCartStore } from '../src/stores/cartStore.js';

const axiosError = (status, error) => ({
  isAxiosError: true,
  response: { status, data: { success: false, error } },
});

describe('format', () => {
  it('formats integer cents as dollars', () => {
    expect(formatPrice(12999)).toBe('$129.99');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('labels stock levels per API.md', () => {
    expect(stockLabel(0).text).toBe('Out of stock');
    expect(stockLabel(3).text).toBe('Only 3 left');
    expect(stockLabel(20).tone).toBe('success');
  });
});

describe('api errors', () => {
  it('normalizes the error envelope', () => {
    const err = toApiError(axiosError(409, { code: 'EMAIL_TAKEN', message: 'Email in use' }));
    expect(err).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', message: 'Email in use' });
  });

  it('reports network failures', () => {
    expect(toApiError({ isAxiosError: true }).code).toBe('NETWORK_ERROR');
  });

  it('maps validation details to field names', () => {
    const err = axiosError(400, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: [
        { path: 'body.email', message: 'Invalid email' },
        { path: 'body.shippingAddress.city', message: 'Required' },
      ],
    });
    expect(fieldErrors(err)).toEqual({
      email: 'Invalid email',
      'shippingAddress.city': 'Required',
    });
  });
});

describe('SSE parsing', () => {
  it('parses an event block', () => {
    expect(parseSseBlock('event: text\ndata: {"delta":"Hi"}')).toEqual({
      event: 'text',
      data: { delta: 'Hi' },
    });
  });

  it('ignores keep-alive comments', () => {
    expect(parseSseBlock(': keep-alive')).toBeNull();
  });
});

describe('AI search chip removal', () => {
  const filters = {
    keywords: 'running',
    category: 'shoes',
    maxPrice: 100,
    minRating: 4,
    sort: 'price_asc',
  };

  it('drops the removed filter and maps the rest to catalog params', () => {
    expect(chipRemovalUrl(filters, 'category')).toBe(
      '/products?q=running&maxPriceCents=10000&minRating=4&sort=price',
    );
  });

  it('removes both bounds for the combined price chip', () => {
    expect(chipRemovalUrl({ minPrice: 20, maxPrice: 50 }, 'price')).toBe('/products');
  });
});

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().reset());

  it('adds up quantities and caps them at 10', () => {
    const { add } = useCartStore.getState();
    add('a', 4);
    add('a', 9);
    expect(useCartStore.getState().items).toEqual([{ productId: 'a', quantity: 10 }]);
  });

  it('replaces items from server pricing and records the owner', () => {
    useCartStore.getState().add('a', 1);
    useCartStore
      .getState()
      .replaceFromPricing({ items: [{ productId: 'b', quantity: 2, priceCents: 100 }] }, 'u1');
    expect(useCartStore.getState()).toMatchObject({
      items: [{ productId: 'b', quantity: 2 }],
      ownerId: 'u1',
    });
  });
});
