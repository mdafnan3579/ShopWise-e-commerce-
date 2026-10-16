import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';
import pkg from '../../package.json' with { type: 'json' };
import { CATEGORIES } from '../config/catalog.js';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../config/commerce.js';
import { PRODUCT_SORTS } from '../validators/product.validators.js';

/**
 * OpenAPI 3.1 spec served at /api/docs. Shared schemas, responses and parameters live here;
 * each endpoint is documented with an `@openapi` JSDoc block in src/docs/paths/*.js.
 * tests/integration/docs.test.js fails if any route is missing from the spec.
 */

const objectId = { type: 'string', pattern: '^[a-f0-9]{24}$', example: '6650f1c2a1b2c3d4e5f60789' };
const cents = (description) => ({ type: 'integer', minimum: 0, description });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: ref('ErrorResponse'),
      ...(example && { example: { success: false, error: example } }),
    },
  },
});

const addressFields = {
  fullName: { type: 'string', maxLength: 80 },
  line1: { type: 'string', maxLength: 120 },
  line2: { type: 'string', maxLength: 120 },
  city: { type: 'string', maxLength: 80 },
  state: { type: 'string', maxLength: 80 },
  postalCode: { type: 'string', maxLength: 20 },
  country: {
    type: 'string',
    pattern: '^[A-Z]{2}$',
    description: 'ISO 3166-1 alpha-2',
    example: 'US',
  },
  phone: { type: 'string', maxLength: 30 },
};

const productCardProperties = {
  _id: objectId,
  name: { type: 'string' },
  slug: { type: 'string' },
  tagline: { type: 'string' },
  priceCents: cents('Price in cents'),
  category: { type: 'string', enum: CATEGORIES },
  brand: { type: 'string' },
  images: { type: 'array', items: ref('Image') },
  averageRating: { type: 'number', minimum: 0, maximum: 5 },
  reviewCount: { type: 'integer' },
  stock: { type: 'integer' },
  isActive: { type: 'boolean' },
};

const definition = {
  openapi: '3.1.0',
  info: {
    title: 'ShopWise API',
    version: pkg.version,
    description: [
      'REST API for ShopWise, an AI-powered e-commerce platform.',
      '',
      '**Conventions**',
      '- Success: `{ success: true, data, message?, meta? }`. Errors: `{ success: false, error: { code, message, details? } }`.',
      '- Money is always **integer cents** (`priceCents`, `totalCents`).',
      '- Auth uses httpOnly cookies (`sw_access`, `sw_refresh`) set by login/register. Browsers must send requests with credentials. A `Authorization: Bearer <access token>` header is also accepted (useful in this UI).',
      '- Lists accept `page` and `limit` (max 100) and return pagination in `meta`.',
      '- `POST /ai/chat` streams Server-Sent Events; see its description for the event format.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'System' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Products' },
    { name: 'Reviews' },
    { name: 'Cart' },
    { name: 'Checkout & Orders' },
    { name: 'AI' },
    { name: 'Admin' },
    { name: 'Webhooks' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sw_access' },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      Page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      IdPath: { name: 'id', in: 'path', required: true, schema: objectId },
    },
    responses: {
      BadRequest: errorResponse('Validation failed', {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ path: 'body.email', message: 'Must be a valid email address' }],
      }),
      Unauthorized: errorResponse(
        'Not authenticated or token expired (`UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`)',
        {
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired',
        },
      ),
      Forbidden: errorResponse('Authenticated but not allowed (`FORBIDDEN`, `CSRF_REJECTED`)', {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action',
      }),
      NotFound: errorResponse('Resource not found', {
        code: 'NOT_FOUND',
        message: 'Product not found',
      }),
      Conflict: errorResponse('Conflicts with existing state'),
      RateLimited: errorResponse('Too many requests', {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later.',
      }),
      AIUnavailable: errorResponse('The AI provider failed or is disabled', {
        code: 'AI_UNAVAILABLE',
        message: 'AI features are temporarily unavailable',
      }),
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      Success: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', const: true },
          data: {},
          message: { type: 'string' },
        },
      },
      Paginated: {
        allOf: [
          { $ref: '#/components/schemas/Success' },
          { type: 'object', properties: { meta: ref('PaginationMeta') } },
        ],
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasNextPage: { type: 'boolean' },
          hasPrevPage: { type: 'boolean' },
        },
      },
      Address: {
        type: 'object',
        properties: {
          _id: objectId,
          label: { type: 'string' },
          ...addressFields,
          isDefault: { type: 'boolean' },
        },
      },
      AddressInput: {
        type: 'object',
        required: ['fullName', 'line1', 'city', 'postalCode', 'country'],
        properties: {
          label: { type: 'string', maxLength: 30 },
          ...addressFields,
          isDefault: { type: 'boolean' },
        },
      },
      ShippingAddress: {
        type: 'object',
        required: ['fullName', 'line1', 'city', 'postalCode', 'country'],
        properties: addressFields,
      },
      User: {
        type: 'object',
        properties: {
          _id: objectId,
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['customer', 'admin'] },
          addresses: { type: 'array', items: ref('Address') },
          wishlist: { type: 'array', items: objectId },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Image: {
        type: 'object',
        properties: {
          _id: objectId,
          url: { type: 'string', format: 'uri' },
          publicId: { type: 'string' },
          alt: { type: 'string' },
        },
      },
      ProductCard: { type: 'object', properties: productCardProperties },
      Product: {
        type: 'object',
        properties: {
          ...productCardProperties,
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          reviewsUpdatedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProductDetail: {
        allOf: [
          ref('Product'),
          {
            type: 'object',
            properties: {
              ratingBreakdown: {
                type: 'object',
                description: 'Number of reviews per star rating',
                example: { 1: 0, 2: 1, 3: 2, 4: 5, 5: 9 },
              },
            },
          },
        ],
      },
      ProductInput: {
        type: 'object',
        required: ['name', 'description', 'priceCents', 'category', 'stock'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 140 },
          slug: { type: 'string', description: 'Optional; generated from name when omitted' },
          tagline: { type: 'string', maxLength: 160 },
          description: { type: 'string', minLength: 20, maxLength: 5000 },
          priceCents: { type: 'integer', minimum: 0 },
          category: { type: 'string', enum: CATEGORIES },
          brand: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          images: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              required: ['url'],
              properties: { url: { type: 'string', format: 'uri' }, alt: { type: 'string' } },
            },
          },
          stock: { type: 'integer', minimum: 0 },
          isActive: { type: 'boolean' },
        },
      },
      Category: {
        type: 'object',
        properties: {
          slug: { type: 'string', enum: CATEGORIES },
          label: { type: 'string' },
          productCount: { type: 'integer' },
        },
      },
      Review: {
        type: 'object',
        properties: {
          _id: objectId,
          user: { type: 'object', properties: { _id: objectId, name: { type: 'string' } } },
          product: objectId,
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          title: { type: 'string' },
          comment: { type: 'string' },
          verifiedPurchase: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ReviewInput: {
        type: 'object',
        required: ['rating', 'comment'],
        properties: {
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          title: { type: 'string', maxLength: 100 },
          comment: { type: 'string', minLength: 10, maxLength: 2000 },
        },
      },
      CartItemInput: {
        type: 'object',
        required: ['productId', 'quantity'],
        properties: { productId: objectId, quantity: { type: 'integer', minimum: 1, maximum: 10 } },
        description:
          'Clients send ids and quantities only; prices are always computed server-side.',
      },
      CartPricing: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: objectId,
                name: { type: 'string' },
                slug: { type: 'string' },
                image: { type: ['string', 'null'] },
                priceCents: { type: 'integer' },
                quantity: { type: 'integer' },
                lineTotalCents: { type: 'integer' },
                stock: { type: 'integer' },
              },
            },
          },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: objectId,
                code: {
                  type: 'string',
                  enum: ['UNAVAILABLE', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK'],
                },
                message: { type: 'string' },
                available: { type: 'integer' },
              },
            },
          },
          coupon: { type: ['object', 'null'] },
          couponError: {
            type: ['object', 'null'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'INVALID_COUPON',
                  'COUPON_EXPIRED',
                  'COUPON_USAGE_LIMIT',
                  'COUPON_MIN_SUBTOTAL',
                ],
              },
              message: { type: 'string' },
            },
          },
          currency: { type: 'string', example: 'usd' },
          subtotalCents: { type: 'integer' },
          discountCents: { type: 'integer' },
          shippingCents: { type: 'integer' },
          taxCents: { type: 'integer' },
          totalCents: { type: 'integer' },
          freeShippingThresholdCents: { type: 'integer' },
        },
      },
      Coupon: {
        type: 'object',
        properties: {
          _id: objectId,
          code: { type: 'string', example: 'WELCOME10' },
          description: { type: 'string' },
          discountType: { type: 'string', enum: ['percent', 'fixed'] },
          value: { type: 'integer', description: 'Percent (1-100) or cents' },
          minSubtotalCents: { type: 'integer' },
          maxDiscountCents: { type: 'integer' },
          expiresAt: { type: 'string', format: 'date-time' },
          usageLimit: { type: 'integer' },
          timesUsed: { type: 'integer' },
          isActive: { type: 'boolean' },
        },
      },
      CouponInput: {
        type: 'object',
        required: ['code', 'discountType', 'value'],
        properties: {
          code: { type: 'string', pattern: '^[A-Z0-9_-]{3,30}$' },
          description: { type: 'string' },
          discountType: { type: 'string', enum: ['percent', 'fixed'] },
          value: { type: 'integer', minimum: 1 },
          minSubtotalCents: { type: 'integer' },
          maxDiscountCents: { type: 'integer' },
          expiresAt: { type: 'string', format: 'date-time' },
          usageLimit: { type: 'integer' },
          isActive: { type: 'boolean' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          _id: objectId,
          orderNumber: { type: 'string', example: 'SW-MG7K2P-9F3A1C' },
          user: {
            oneOf: [
              objectId,
              {
                type: 'object',
                properties: { _id: objectId, name: { type: 'string' }, email: { type: 'string' } },
              },
            ],
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: objectId,
                name: { type: 'string' },
                slug: { type: 'string' },
                image: { type: 'string' },
                priceCents: { type: 'integer' },
                quantity: { type: 'integer' },
                lineTotalCents: { type: 'integer' },
              },
            },
          },
          shippingAddress: ref('ShippingAddress'),
          subtotalCents: { type: 'integer' },
          discountCents: { type: 'integer' },
          taxCents: { type: 'integer' },
          shippingCents: { type: 'integer' },
          totalCents: { type: 'integer' },
          currency: { type: 'string' },
          coupon: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              discountType: { type: 'string' },
              value: { type: 'integer' },
            },
          },
          paymentStatus: { type: 'string', enum: PAYMENT_STATUSES },
          orderStatus: { type: 'string', enum: ORDER_STATUSES },
          statusHistory: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                at: { type: 'string', format: 'date-time' },
                note: { type: 'string' },
              },
            },
          },
          paidAt: { type: 'string', format: 'date-time' },
          shippedAt: { type: 'string', format: 'date-time' },
          deliveredAt: { type: 'string', format: 'date-time' },
          cancelledAt: { type: 'string', format: 'date-time' },
          needsAttention: { type: 'object', description: 'Admin only' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ReviewSummary: {
        oneOf: [
          {
            type: 'object',
            properties: {
              status: { const: 'ready' },
              aiGenerated: { const: true },
              cached: { type: 'boolean' },
              stale: { type: 'boolean' },
              summary: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
              generatedAt: { type: 'string', format: 'date-time' },
              basedOnReviews: { type: 'integer' },
            },
          },
          {
            type: 'object',
            properties: {
              status: { const: 'insufficient_reviews' },
              reviewCount: { type: 'integer' },
              minReviews: { type: 'integer' },
            },
          },
          { type: 'object', properties: { status: { const: 'unavailable' } } },
        ],
      },
      ChatSession: {
        type: 'object',
        properties: {
          _id: objectId,
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', description: 'Markdown for assistant messages' },
                productIds: { type: 'array', items: ref('ProductCard') },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SearchFilterChip: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'maxPrice' },
          label: { type: 'string', example: 'Under $100' },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          range: { type: 'object' },
          totals: {
            type: 'object',
            properties: {
              revenueCents: { type: 'integer' },
              orders: { type: 'integer' },
              unitsSold: { type: 'integer' },
              averageOrderValueCents: { type: 'integer' },
              newCustomers: { type: 'integer' },
            },
          },
          changeVsPreviousPeriod: {
            type: 'object',
            description:
              'Percent change vs the previous period of equal length (null when there is no baseline)',
          },
          revenueOverTime: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                period: { type: 'string', format: 'date-time' },
                revenueCents: { type: 'integer' },
                orders: { type: 'integer' },
                newCustomers: { type: 'integer' },
              },
            },
          },
          ordersByStatus: { type: 'object' },
          topProducts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: objectId,
                name: { type: 'string' },
                unitsSold: { type: 'integer' },
                revenueCents: { type: 'integer' },
              },
            },
          },
          lowStock: {
            type: 'object',
            properties: {
              threshold: { type: 'integer' },
              products: { type: 'array', items: ref('ProductCard') },
            },
          },
          ordersNeedingAttention: { type: 'integer' },
        },
      },
    },
  },
};

// Enum reused by path docs.
definition.components.schemas.ProductSort = { type: 'string', enum: PRODUCT_SORTS };

const pathDocs = fileURLToPath(new URL('./paths/*.js', import.meta.url)).replace(/\\/g, '/');

export const openApiSpec = swaggerJsdoc({ definition, apis: [pathDocs], failOnErrors: true });
