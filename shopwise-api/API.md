# ShopWise API — Frontend Contract

The complete HTTP contract between the ShopWise React app and this API. Interactive docs with
"Try it out" are served at **`/api/docs`** (OpenAPI 3.1, raw spec at `/api/docs.json`); a test
fails CI if any route is missing from that spec.

- [1. Conventions](#1-conventions)
- [2. Authentication & sessions](#2-authentication--sessions)
- [3. Data shapes](#3-data-shapes)
- [4. Endpoints](#4-endpoints)
  - [System](#system) · [Auth](#auth) · [Users](#users) · [Products](#products) · [Reviews](#reviews) · [Cart & coupons](#cart--coupons) · [Checkout & orders](#checkout--orders) · [AI](#ai) · [Admin](#admin) · [Webhooks](#webhooks)
- [5. AI chat streaming (SSE) format](#5-ai-chat-streaming-sse-format)
- [6. Error codes](#6-error-codes)
- [7. Rate limits](#7-rate-limits)
- [8. Frontend integration notes](#8-frontend-integration-notes)

---

## 1. Conventions

| Topic             | Rule                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL          | `VITE_API_URL`, e.g. `http://localhost:5000`. All resource paths are under **`/api/v1`**.                                                                                      |
| Format            | JSON request and response bodies (`Content-Type: application/json`). Form-encoded bodies are ignored. Only image upload uses `multipart/form-data`.                            |
| Credentials       | Auth is cookie-based. **Every request must send credentials** (`axios.create({ withCredentials: true })` / `fetch(url, { credentials: 'include' })`).                          |
| Success envelope  | `{ "success": true, "data": <payload>, "message"?: string, "meta"?: Pagination }`                                                                                              |
| Error envelope    | `{ "success": false, "error": { "code": "SCREAMING_SNAKE", "message": "Human readable", "details"?: any } }`                                                                   |
| Validation errors | `400 VALIDATION_ERROR`, `details: [{ "path": "body.email", "message": "..." }]`. `path` is prefixed with `body.`, `query.` or `params.`.                                       |
| Money             | **Integer cents** everywhere (`priceCents: 12999` = $129.99). Currency is `usd`. Format on the client.                                                                         |
| Ids               | MongoDB ObjectId strings, 24 hex chars, field `_id`.                                                                                                                           |
| Dates             | ISO 8601 strings in UTC.                                                                                                                                                       |
| Pagination        | List endpoints take `page` (default 1) and `limit` (default 20, max 100) and return `meta: { page, limit, total, totalPages, hasNextPage, hasPrevPage }`; `data` is the array. |
| Sorting           | `sort` takes one value from an allow-list per endpoint; a leading `-` means descending.                                                                                        |
| Booleans in query | `true` / `false` (also `1` / `0`).                                                                                                                                             |
| Request id        | Every response has an `X-Request-Id` header, handy in bug reports.                                                                                                             |

### Pagination example

```json
{
  "success": true,
  "data": [/* items */],
  "meta": {
    "page": 2,
    "limit": 20,
    "total": 48,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

---

## 2. Authentication & sessions

| Cookie       | Contents                        | Lifetime   | Path           |
| ------------ | ------------------------------- | ---------- | -------------- |
| `sw_access`  | JWT access token                | 15 minutes | `/`            |
| `sw_refresh` | Opaque refresh token            | 7 days     | `/api/v1/auth` |
| `sw_guest`   | Anonymous id for guest AI chats | 7 days     | `/api/v1/ai`   |

All are `httpOnly` (JavaScript cannot read them), `Secure` in production, `SameSite=Lax`
(or `None` when the API and frontend are on different sites). The frontend never stores tokens.

**Session restore on page load:** call `GET /api/v1/auth/me`. `200` → logged in; `401` → try
`POST /api/v1/auth/refresh` once; if that also fails, the user is a guest.

**Refresh interceptor (recommended):**

1. A request fails with `401` and `error.code` is `TOKEN_EXPIRED` (or `UNAUTHORIZED` while the user was logged in).
2. Call `POST /api/v1/auth/refresh` (no body). **Share one in-flight refresh promise** between all
   requests that fail at the same time: refresh tokens rotate on every use, and replaying an
   already-used token is treated as theft (`REFRESH_TOKEN_REUSED`) and logs the user out everywhere.
3. On success, retry the original request **once**. On failure, clear client auth state and redirect to login.
4. Never try to refresh after `/auth/login`, `/auth/register` or `/auth/refresh` itself fail.

**CSRF:** state-changing requests (`POST`/`PUT`/`PATCH`/`DELETE`) from an origin not listed in
the API's `CLIENT_URL` get `403 CSRF_REJECTED`. Browsers set `Origin` automatically; nothing to do client-side.

**Bearer alternative:** `Authorization: Bearer <access JWT>` is also accepted (used by Swagger UI, scripts).

Demo accounts after `npm run seed`: admin `admin@shopwise.dev` / `Admin@12345`, customer `demo@shopwise.dev` / `Demo@12345`.

---

## 3. Data shapes

Shapes below are what the API returns. `?` = may be absent.

```ts
User {
  _id, name, email, role: 'customer' | 'admin',
  addresses: Address[], wishlist: string[] /* product ids */, createdAt, updatedAt
}

Address { _id, label?, fullName, line1, line2?, city, state?, postalCode, country /* ISO-2, e.g. "US" */, phone?, isDefault }
ShippingAddress = Address without _id, label, isDefault

Image { _id, url, publicId?, alt? }

ProductCard {
  _id, name, slug, tagline?, priceCents, category, brand, tags?, images: Image[],
  averageRating /* 0–5, 1 decimal */, reviewCount, stock, isActive, createdAt?
}
Product = ProductCard & { description, tags: string[], reviewsUpdatedAt?, updatedAt }
ProductDetail = Product & { ratingBreakdown: { "1": n, "2": n, "3": n, "4": n, "5": n } }

Category { slug, label, productCount }
// slugs: electronics, clothing, shoes, home-kitchen, sports-outdoors, beauty, books, toys-games

Review { _id, user: { _id, name }, product, rating /* 1–5 */, title?, comment, verifiedPurchase, createdAt, updatedAt }

CartItemInput { productId, quantity /* 1–10 */ }
CartPricing {
  items: [{ productId, name, slug, image: string | null, priceCents, quantity, lineTotalCents, stock }],
  issues: [{ productId, code: 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK', message, available? }],
  coupon: { code, discountType: 'percent' | 'fixed', value, description? } | null,
  couponError: { code, message } | null,
  currency: 'usd', subtotalCents, discountCents, shippingCents, taxCents, totalCents,
  freeShippingThresholdCents /* 7500 */
}

Order {
  _id, orderNumber /* "SW-MG7K2P-9F3A1C" */, user /* id, or { _id, name, email } in admin views */,
  items: [{ product, name, slug?, image?, priceCents, quantity, lineTotalCents }],
  shippingAddress: ShippingAddress,
  subtotalCents, discountCents, taxCents, shippingCents, totalCents, currency,
  coupon?: { code, discountType, value },
  paymentStatus: 'unpaid' | 'paid' | 'failed' | 'refunded',
  orderStatus: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled',
  statusHistory: [{ status, at, note? }],
  paidAt?, shippedAt?, deliveredAt?, cancelledAt?, createdAt, updatedAt,
  needsAttention? /* admin only: { reason, details } */
}

Coupon { _id, code, description?, discountType, value /* percent 1–100 or cents */, minSubtotalCents,
         maxDiscountCents?, expiresAt?, usageLimit?, timesUsed, isActive, createdAt }
```

Pricing rules: shipping is free when (subtotal − discount) ≥ $75, otherwise $5.99; tax is a flat
8% of (subtotal − discount). Always display the server's numbers, never recompute them.

---

## 4. Endpoints

Auth column: **—** public · **User** logged in · **Admin** admin role · **Opt** optional (behaves differently when logged in).
Every endpoint can also return `400 VALIDATION_ERROR`, `429 RATE_LIMITED` and `500 INTERNAL_ERROR`; those are omitted below unless notable.

### System

| Method | Path                           | Auth | Response `data`                                                                                                                |
| ------ | ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health` and `/api/v1/health` | —    | `{ status: 'ok', version, uptimeSeconds, timestamp, checks: { database } }`; **503** `SERVICE_UNAVAILABLE` when the DB is down |

### Auth

| Method | Path                    | Auth           | Body                               | Response `data`                     | Errors                                                                                                                  |
| ------ | ----------------------- | -------------- | ---------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register` | —              | `{ name (2–80), email, password }` | `201 { user: User }` + sets cookies | `409 EMAIL_TAKEN`                                                                                                       |
| POST   | `/api/v1/auth/login`    | —              | `{ email, password }`              | `{ user: User }` + sets cookies     | `401 INVALID_CREDENTIALS`                                                                                               |
| POST   | `/api/v1/auth/refresh`  | refresh cookie | —                                  | `{ user: User }` + rotates cookies  | `401 REFRESH_TOKEN_MISSING`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED` (cookies cleared) |
| POST   | `/api/v1/auth/logout`   | —              | —                                  | `null`, clears cookies (always 200) | —                                                                                                                       |
| GET    | `/api/v1/auth/me`       | User           | —                                  | `{ user: User }`                    | `401`                                                                                                                   |

Password rules: 8+ characters, at least one letter and one number, max 72 bytes.
Email is case-insensitive (stored lowercase).

### Users

| Method | Path                                    | Auth | Body                                                                                                           | Response `data`                                                   | Errors                                       |
| ------ | --------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| PATCH  | `/api/v1/users/me`                      | User | `{ name?, email?, currentPassword? }` (at least one of name/email; `currentPassword` required to change email) | `{ user: User }`                                                  | `401 INVALID_CREDENTIALS`, `409 EMAIL_TAKEN` |
| PATCH  | `/api/v1/users/me/password`             | User | `{ currentPassword, newPassword }`                                                                             | `null`; other devices are signed out, this one gets fresh cookies | `401 INVALID_CREDENTIALS`                    |
| GET    | `/api/v1/users/me/addresses`            | User | —                                                                                                              | `{ addresses: Address[] }`                                        |                                              |
| POST   | `/api/v1/users/me/addresses`            | User | `{ label?, fullName, line1, line2?, city, state?, postalCode, country, phone?, isDefault? }`                   | `201 { addresses: Address[] }`                                    | `400 ADDRESS_LIMIT` (max 10)                 |
| PATCH  | `/api/v1/users/me/addresses/:addressId` | User | any address fields                                                                                             | `{ addresses: Address[] }`                                        | `404`                                        |
| DELETE | `/api/v1/users/me/addresses/:addressId` | User | —                                                                                                              | `{ addresses: Address[] }`                                        | `404`                                        |
| GET    | `/api/v1/users/me/wishlist`             | User | —                                                                                                              | `{ items: ProductCard[] }`                                        |                                              |
| POST   | `/api/v1/users/me/wishlist/:productId`  | User | —                                                                                                              | `{ items: ProductCard[] }` (idempotent)                           | `404`, `400 WISHLIST_LIMIT` (max 100)        |
| DELETE | `/api/v1/users/me/wishlist/:productId`  | User | —                                                                                                              | `{ items: ProductCard[] }`                                        |                                              |

Address invariants: exactly one default; the first address is the default; deleting the default
promotes the first remaining one. Country is a 2-letter code (normalized to upper case).

### Products

| Method | Path                                   | Auth  | Request                                               | Response `data`                        | Errors                                                                                                                       |
| ------ | -------------------------------------- | ----- | ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/products`                     | —     | query below                                           | `ProductCard[]` + `meta`               |                                                                                                                              |
| GET    | `/api/v1/products/categories`          | —     | —                                                     | `Category[]` (all 8, with counts)      |                                                                                                                              |
| GET    | `/api/v1/products/:idOrSlug`           | Opt   | —                                                     | `ProductDetail`                        | `404` (inactive products: admins only)                                                                                       |
| GET    | `/api/v1/products/:id/related`         | —     | —                                                     | `ProductCard[]` (≤ 8, same category)   | `404`                                                                                                                        |
| POST   | `/api/v1/products`                     | Admin | `ProductInput`                                        | `201 Product`                          | `403`                                                                                                                        |
| PATCH  | `/api/v1/products/:id`                 | Admin | partial `ProductInput`                                | `Product`                              | `404`, `409 CONFLICT` (slug)                                                                                                 |
| DELETE | `/api/v1/products/:id`                 | Admin | —                                                     | `null` (soft delete: `isActive=false`) | `404`                                                                                                                        |
| POST   | `/api/v1/products/:id/images`          | Admin | `multipart/form-data`, field **`images`** (1–5 files) | `201 Product`                          | `400 INVALID_FILE_TYPE`, `IMAGE_LIMIT`, `UPLOAD_ERROR`; `413 FILE_TOO_LARGE`; `502 UPLOAD_FAILED`; `503 UPLOADS_UNAVAILABLE` |
| DELETE | `/api/v1/products/:id/images/:imageId` | Admin | —                                                     | `Product`                              | `404`                                                                                                                        |

**`GET /products` query** (all optional, combine freely):

| Param                            | Type                                                                                  | Notes                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `q`                              | string ≤ 100                                                                          | Full-text search on name (strongest), brand, tags, description; falls back to partial match |
| `category`                       | category slug                                                                         |                                                                                             |
| `brand`                          | string                                                                                | exact, case-insensitive                                                                     |
| `minPriceCents`, `maxPriceCents` | integer                                                                               | min ≤ max                                                                                   |
| `minRating`                      | 0–5                                                                                   |                                                                                             |
| `inStock`                        | boolean                                                                               |                                                                                             |
| `tags`                           | comma-separated                                                                       | matches any                                                                                 |
| `sort`                           | `relevance` · `-createdAt` · `price` · `-price` · `-rating` · `-reviewCount` · `name` | default `relevance` with `q`, else `-createdAt`                                             |
| `page`, `limit`                  |                                                                                       |                                                                                             |

These map 1:1 to URL params, so the listing page can mirror its filters in the URL.

**`ProductInput`:** `{ name (2–140), slug?, tagline? (≤160), description (20–5000), priceCents (int), category, brand?, tags? (≤20), images? ([{ url: https URL, alt? }] ≤ 8), stock (int ≥ 0), isActive? }`.
Slugs are generated from the name and stay stable on rename unless `slug` is sent.

### Reviews

| Method | Path                           | Auth                   | Request                                                                                          | Response `data`     | Errors                        |
| ------ | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------- |
| GET    | `/api/v1/products/:id/reviews` | —                      | `sort` (`-createdAt` default, `createdAt`, `-rating`, `rating`), `rating` (1–5), `page`, `limit` | `Review[]` + `meta` | `404`                         |
| POST   | `/api/v1/products/:id/reviews` | User                   | `{ rating (1–5 int), title? (≤100), comment (10–2000) }`                                         | `201 Review`        | `409 ALREADY_REVIEWED`, `404` |
| PATCH  | `/api/v1/reviews/:id`          | User (author)          | any of the fields above                                                                          | `Review`            | `403`, `404`                  |
| DELETE | `/api/v1/reviews/:id`          | User (author) or Admin | —                                                                                                | `null`              | `403`, `404`                  |

The product's `averageRating` / `reviewCount` / `ratingBreakdown` update immediately after any review change; refetch the product.
To know whether the current user already reviewed, compare `review.user._id` with the logged-in user's `_id`.

### Cart & coupons

The cart lives in the client (Zustand + localStorage) **and**, for logged-in users, on the server.
The client only ever sends `{ productId, quantity }`; prices always come from the server.

| Method | Path                       | Auth | Body                                            | Response `data`                                                                    |
| ------ | -------------------------- | ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/api/v1/cart/validate`    | —    | `{ items: CartItemInput[] (≤50), couponCode? }` | `CartPricing`                                                                      |
| GET    | `/api/v1/cart`             | User | —                                               | `CartPricing` of the saved cart                                                    |
| PUT    | `/api/v1/cart`             | User | `{ items: CartItemInput[] }`                    | `CartPricing` (replaces saved cart)                                                |
| POST   | `/api/v1/cart/merge`       | User | `{ items: CartItemInput[] }`                    | `CartPricing` (guest cart merged in; same product quantities add up, capped at 10) |
| DELETE | `/api/v1/cart`             | User | —                                               | `null`                                                                             |
| POST   | `/api/v1/coupons/validate` | —    | `{ code, items: CartItemInput[] (≥1) }`         | `{ coupon, discountCents, totals: CartPricing }`                                   |

`/cart/validate` never fails because of stock or coupons: problems come back in `issues` and
`couponError` so the cart page can show them inline. `/coupons/validate` returns `400` with the
coupon error code (`INVALID_COUPON`, `COUPON_EXPIRED`, `COUPON_USAGE_LIMIT`, `COUPON_MIN_SUBTOTAL`).
The server cart is emptied automatically when an order is paid.

Seeded coupons: `WELCOME10` (10%, max $50), `SAVE20` ($20 off orders ≥ $100), `FLASH25` (25%, limited), `SUMMER15` (expired).

### Checkout & orders

| Method | Path                                      | Auth | Request                                                                                                                         | Response `data`                                   | Errors                                                                                                                                                   |
| ------ | ----------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/checkout/session`                | User | `{ items: CartItemInput[] (≥1), couponCode?, addressId? \| shippingAddress? }` — exactly one of `addressId` / `shippingAddress` | `201 { orderId, orderNumber, sessionId, url }`    | `400 EMPTY_CART` / coupon codes, `404` (address), `409 CART_ISSUES` (`details` = issues array), `502 PAYMENT_PROVIDER_ERROR`, `503 PAYMENTS_UNAVAILABLE` |
| GET    | `/api/v1/orders/me`                       | User | `status?`, `page`, `limit`                                                                                                      | `Order[]` (summary fields) + `meta`, newest first |                                                                                                                                                          |
| GET    | `/api/v1/orders/me/:id`                   | User | —                                                                                                                               | `Order`                                           | `404` (also for other users' orders)                                                                                                                     |
| GET    | `/api/v1/orders/me/by-session/:sessionId` | User | —                                                                                                                               | `Order`                                           | `404`                                                                                                                                                    |
| POST   | `/api/v1/orders/:id/cancel`               | User | —                                                                                                                               | `Order`                                           | `409 ORDER_NOT_CANCELLABLE` (only `pending` + `unpaid`)                                                                                                  |

**Checkout flow**

1. `POST /checkout/session` → `window.location.assign(data.url)` (Stripe-hosted page).
2. Stripe redirects to **`{CLIENT_URL}/checkout/success?session_id=cs_...`** on success or **`{CLIENT_URL}/cart?checkout=cancelled`** on cancel.
3. The success page calls `GET /orders/me/by-session/:sessionId`. The order is marked paid by a
   server-to-server webhook, which can lag the redirect by a few seconds: while
   `paymentStatus === 'unpaid'`, poll every ~2 s (stop after ~30 s and show "processing").
4. After payment the server cart is empty; clear the local cart too.

Order statuses: `pending → paid → shipped → delivered`; `cancelled` from `pending` (customer or
admin) or from `paid` (admin, refunds via Stripe → `paymentStatus: 'refunded'`).
Stripe test card: `4242 4242 4242 4242`, any future date, any CVC.

### AI

Every AI feature is optional for the UI: on any AI problem the API degrades instead of failing
(details per endpoint). Label AI content as AI-generated.

| Method | Path                                    | Auth        | Request                                                            | Response `data`                                                                                      | Degradation                                                      |
| ------ | --------------------------------------- | ----------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/api/v1/ai/chat`                       | Opt         | `{ message (1–1000), sessionId? }`                                 | **SSE stream**, see [section 5](#5-ai-chat-streaming-sse-format)                                     | `error` event + fallback reply + top-rated `products`            |
| GET    | `/api/v1/ai/chat/sessions/:id`          | Opt (owner) | —                                                                  | `{ _id, messages: [{ role, content, productIds: ProductCard[], createdAt }], createdAt, updatedAt }` | `404` if not yours                                               |
| DELETE | `/api/v1/ai/chat/sessions/:id`          | Opt (owner) | —                                                                  | `null`                                                                                               | `404`                                                            |
| POST   | `/api/v1/ai/search`                     | Opt         | `{ query (2–200), page?, limit? }`                                 | see below, + `meta`                                                                                  | `fallback: true` → plain text search results                     |
| GET    | `/api/v1/products/:id/review-summary`   | —           | —                                                                  | see below (always 200)                                                                               | `status: 'unavailable'` or stale cache                           |
| GET    | `/api/v1/ai/recommendations`            | Opt         | —                                                                  | see below                                                                                            | `source: 'fallback'` / `'top_rated'`, `reason: null`             |
| POST   | `/api/v1/ai/admin/generate-description` | Admin       | `{ name, category, features: string[] (1–12), brand?, audience? }` | `{ description, tagline, tags: string[], aiGenerated: true }`                                        | `503 AI_UNAVAILABLE` (hide/disable the button, form still works) |

**AI search response `data`:**

```json
{
  "products": [/* ProductCard[] */],
  "interpretedFilters": {
    "keywords": "waterproof running",
    "category": "shoes",
    "maxPrice": 100,
    "minRating": 4
  },
  "chips": [
    { "key": "keywords", "label": "“waterproof running”" },
    { "key": "category", "label": "Shoes" },
    { "key": "maxPrice", "label": "Under $100" },
    { "key": "minRating", "label": "4+ stars" }
  ],
  "summary": "Showing results for: “waterproof running”, Shoes, Under $100, 4+ stars",
  "fallback": false,
  "relaxed": false
}
```

- `interpretedFilters` prices are **dollars** (`minPrice`, `maxPrice`); `sort` ∈ `relevance | price_asc | price_desc | rating | newest`; also `inStockOnly`.
- Chip `key` ∈ `keywords | category | price | minPrice | maxPrice | minRating | inStockOnly | sort`.
  To "remove" a chip, drop that filter and run a normal `GET /products` query, mapping:
  `keywords→q`, `category→category`, `minPrice/maxPrice × 100 → minPriceCents/maxPriceCents`,
  `minRating→minRating`, `inStockOnly→inStock`, `sort: price_asc→price, price_desc→-price, rating→-rating, newest→-createdAt`.
- `relaxed: true` → no exact match, keywords were dropped (keyword chip omitted).
- `fallback: true` → AI unavailable; `interpretedFilters: null`, `chips: []`, results are plain text search.

**Review summary `data`** (always HTTP 200; render only when `status === 'ready'`):

```json
{
  "status": "ready",
  "aiGenerated": true,
  "cached": true,
  "stale": false,
  "summary": "Reviewers love the comfort and battery life.",
  "pros": ["Comfortable", "Long battery life"],
  "cons": ["Pricey"],
  "generatedAt": "2026-10-16T10:00:00.000Z",
  "basedOnReviews": 12
}
```

Other shapes: `{ "status": "insufficient_reviews", "reviewCount": 2, "minReviews": 3 }`, `{ "status": "unavailable" }`.

**Recommendations `data`:**

```json
{
  "source": "ai",
  "cached": false,
  "generatedAt": "2026-10-16T10:00:00.000Z",
  "items": [
    { "product": {/* ProductCard */}, "reason": "Pairs well with the trail shoes you bought." }
  ]
}
```

`source`: `ai` (personalized, `reason` set, cached 1 h) · `top_rated` (guest / no history, `reason: null`) · `fallback` (AI failed, `reason: null`). Show the reason line only when non-null.

### Admin

All `/api/v1/admin/*` routes require the admin role (`401` / `403` otherwise).

| Method | Path                              | Request                                                                                                                                                                           | Response `data`                                      | Errors                                                                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/admin/stats`             | `from?`, `to?` (ISO dates; default last 30 days), `granularity` = `day` (default) \| `week` \| `month`                                                                            | `Stats` (below)                                      | `400` (from ≥ to, or range too large: day ≤ 366 d, week ≤ 2 y, month ≤ 5 y)                                            |
| GET    | `/api/v1/admin/users`             | `q?` (name/email), `role?`, `sort` (`-createdAt`, `createdAt`, `name`, `-name`, `email`), `page`, `limit`                                                                         | `User[]` (name, email, role, dates) + `meta`         |                                                                                                                        |
| PATCH  | `/api/v1/admin/users/:id/role`    | `{ role: 'customer' \| 'admin' }`                                                                                                                                                 | `{ user }`                                           | `400 CANNOT_CHANGE_OWN_ROLE`, `404`                                                                                    |
| GET    | `/api/v1/admin/products`          | all `GET /products` params + `status` (`all` default, `active`, `inactive`) + `lowStock` (stock ≤ 5)                                                                              | `ProductCard[]` + `meta`                             |                                                                                                                        |
| GET    | `/api/v1/admin/orders`            | `status?`, `paymentStatus?`, `q?` (order number or customer name/email), `from?`, `to?`, `sort` (`-createdAt` default, `createdAt`, `-totalCents`, `totalCents`), `page`, `limit` | `Order[]` with `user: { _id, name, email }` + `meta` |                                                                                                                        |
| GET    | `/api/v1/admin/orders/:id`        | —                                                                                                                                                                                 | `Order` (incl. `needsAttention`)                     | `404`                                                                                                                  |
| PATCH  | `/api/v1/admin/orders/:id/status` | `{ status: 'shipped' \| 'delivered' \| 'cancelled', note? (≤300) }`                                                                                                               | `Order`                                              | `409 INVALID_STATUS_TRANSITION` (`details: { from, allowed }`), `409 REFUND_UNAVAILABLE`, `502 PAYMENT_PROVIDER_ERROR` |
| GET    | `/api/v1/admin/coupons`           | `q?`, `active?`, `sort` (`-createdAt`, `createdAt`, `code`, `-timesUsed`), `page`, `limit`                                                                                        | `Coupon[]` + `meta`                                  |                                                                                                                        |
| POST   | `/api/v1/admin/coupons`           | `{ code (A-Z0-9_- 3–30), description?, discountType, value, minSubtotalCents?, maxDiscountCents?, expiresAt?, usageLimit?, isActive? }`                                           | `201 Coupon`                                         | `409` duplicate code, `400` percent > 100                                                                              |
| PATCH  | `/api/v1/admin/coupons/:id`       | partial of the above                                                                                                                                                              | `Coupon`                                             | `404`, `409`                                                                                                           |
| DELETE | `/api/v1/admin/coupons/:id`       | —                                                                                                                                                                                 | `null`                                               | `404`                                                                                                                  |

Product create/update/delete/images and `POST /ai/admin/generate-description` are also admin-only (listed in their sections).

**`Stats`:**

```json
{
  "range": {
    "from": "2026-09-16T00:00:00.000Z",
    "to": "2026-10-16T00:00:00.000Z",
    "granularity": "day"
  },
  "totals": {
    "revenueCents": 482300,
    "orders": 61,
    "unitsSold": 97,
    "averageOrderValueCents": 7907,
    "newCustomers": 4
  },
  "changeVsPreviousPeriod": {
    "revenuePercent": 12.5,
    "ordersPercent": 8.2,
    "averageOrderValuePercent": 4.1,
    "newCustomersPercent": null
  },
  "revenueOverTime": [
    { "period": "2026-09-16T00:00:00.000Z", "revenueCents": 15800, "orders": 2, "newCustomers": 0 }
  ],
  "ordersByStatus": { "pending": 1, "paid": 3, "shipped": 6, "delivered": 50, "cancelled": 2 },
  "topProducts": [
    {
      "productId": "…",
      "name": "Aurora ANC Wireless Headphones",
      "unitsSold": 9,
      "revenueCents": 179991
    }
  ],
  "lowStock": {
    "threshold": 5,
    "products": [
      { "_id": "…", "name": "…", "slug": "…", "stock": 0, "category": "…", "images": [] }
    ]
  },
  "ordersNeedingAttention": 0
}
```

`revenueOverTime` has one entry per bucket (zeros included) so it can feed a chart directly.
`*Percent` is `null` when the previous period had nothing to compare against. Revenue counts paid orders only.

### Webhooks

| Method | Path                      | Auth             | Notes                                        |
| ------ | ------------------------- | ---------------- | -------------------------------------------- |
| POST   | `/api/v1/webhooks/stripe` | Stripe signature | Called by Stripe only. Not for the frontend. |

---

## 5. AI chat streaming (SSE) format

`POST /api/v1/ai/chat` responds with `Content-Type: text/event-stream`. Because it is a POST,
use `fetch` with a stream reader (the browser `EventSource` API only supports GET).

**Before the stream starts**, errors are normal JSON with the usual status codes:
`400 VALIDATION_ERROR` (empty or > 1000 chars), `404 NOT_FOUND` (unknown or someone else's `sessionId`),
`429 RATE_LIMITED` (10 messages/min). Check `response.ok` and the content type first.

**Once the stream starts** (HTTP 200), it is a sequence of events. Each event is two lines and a
blank line:

```
event: <name>
data: <JSON>

```

Lines starting with `:` (e.g. `: keep-alive`, every 15 s) are comments: ignore them.

| Event      | Data                                                                                                     | Meaning                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`  | `{ "sessionId": "…" }`                                                                                   | Always first. Store it and send it with the next message to continue the conversation.                                                                                    |
| `tool`     | `{ "name": "search_products", "status": "running" }`                                                     | The assistant is working. Names: `search_products`, `get_product_details`, `compare_products`, `check_stock`, `show_products`. Use for a "Searching products…" indicator. |
| `text`     | `{ "delta": "Here are " }`                                                                               | A chunk of the reply in **Markdown**. Append deltas in order.                                                                                                             |
| `products` | `{ "products": ProductCard[] }`                                                                          | Product cards to render under the reply (≤ 4; ≤ 4 top-rated in fallback). Every id is a real, active product. At most one per turn, sent after the text.                  |
| `error`    | `{ "code": "AI_UNAVAILABLE", "message": "…" }`                                                           | The AI failed or is disabled. A fallback text reply and `products` (top-rated) still follow. Show a subtle notice, not an error page.                                     |
| `done`     | `{ "sessionId": "…", "usage": { "inputTokens", "outputTokens", "cacheReadTokens" }, "fallback"?: true }` | Always last. Then the server closes the connection.                                                                                                                       |

Typical order: `session` → (`tool`* · `text`_)… → `products`? → `done`; with a failure:
`session` → `text`_ → `error` → `text` → `products` → `done`.

**Stop button:** abort the fetch (`AbortController.abort()`). The server notices the disconnect,
stops the model call, and still saves the partial reply.

**Off-topic requests** are answered politely in `text` (no special event).

**Reference client:**

```js
export async function streamChat({ message, sessionId, onEvent, signal }) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
    signal,
  });

  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error(body?.error?.message ?? 'Chat failed'), {
      status: res.status,
      code: body?.error?.code,
    });
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!block.startsWith('event:')) continue; // keep-alive comment
      const [eventLine, dataLine] = block.split('\n');
      onEvent(eventLine.slice(7), JSON.parse(dataLine.slice(6)));
    }
  }
}
```

A 401 here (expired access token) is a normal JSON error before the stream: refresh and retry
like any other request. Guests need no login; their sessions are tied to the `sw_guest` cookie.
Reloading a conversation: `GET /api/v1/ai/chat/sessions/:sessionId` (messages include their product cards).

---

## 6. Error codes

| HTTP | `error.code`                                                                                                | Meaning / client action                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR`                                                                                          | Field errors in `details[]` → show next to inputs                        |
| 400  | `INVALID_JSON`                                                                                              | Malformed body                                                           |
| 400  | `INVALID_ID`                                                                                                | Malformed id in a path                                                   |
| 400  | `INVALID_INPUT`                                                                                             | Body/query contained a `$` or dotted key                                 |
| 400  | `BAD_REQUEST`                                                                                               | Other malformed request                                                  |
| 400  | `EMPTY_CART` · `ADDRESS_LIMIT` · `WISHLIST_LIMIT` · `IMAGE_LIMIT` · `CART_LIMIT` · `CANNOT_CHANGE_OWN_ROLE` | Business rule; show `message`                                            |
| 400  | `INVALID_COUPON` · `COUPON_EXPIRED` · `COUPON_USAGE_LIMIT` · `COUPON_MIN_SUBTOTAL`                          | Coupon rejected; show `message` next to the coupon field                 |
| 400  | `INVALID_FILE_TYPE` · `UPLOAD_ERROR`                                                                        | Upload rejected                                                          |
| 401  | `UNAUTHORIZED`                                                                                              | Not logged in                                                            |
| 401  | `TOKEN_EXPIRED`                                                                                             | Access token expired → refresh and retry                                 |
| 401  | `INVALID_TOKEN`                                                                                             | Bad token → refresh; if that fails, log out                              |
| 401  | `INVALID_CREDENTIALS`                                                                                       | Wrong email/password (or wrong current password)                         |
| 401  | `REFRESH_TOKEN_MISSING` · `INVALID_REFRESH_TOKEN` · `REFRESH_TOKEN_EXPIRED` · `REFRESH_TOKEN_REUSED`        | Session over → log out locally                                           |
| 403  | `FORBIDDEN`                                                                                                 | Wrong role / not the owner                                               |
| 403  | `CSRF_REJECTED`                                                                                             | Request from a non-allowed origin                                        |
| 404  | `NOT_FOUND`                                                                                                 | Resource or route not found                                              |
| 409  | `CONFLICT` · `EMAIL_TAKEN` · `ALREADY_REVIEWED`                                                             | Duplicate                                                                |
| 409  | `CART_ISSUES`                                                                                               | Checkout blocked; `details` = `CartPricing.issues` → revalidate the cart |
| 409  | `ORDER_NOT_CANCELLABLE` · `INVALID_STATUS_TRANSITION` · `REFUND_UNAVAILABLE`                                | Order state doesn't allow it                                             |
| 413  | `PAYLOAD_TOO_LARGE` · `FILE_TOO_LARGE`                                                                      | Body > 100 kb / image > 5 MB                                             |
| 429  | `RATE_LIMITED`                                                                                              | Back off; `RateLimit` / `RateLimit-Policy` headers say when              |
| 500  | `INTERNAL_ERROR`                                                                                            | Unexpected; quote `X-Request-Id`                                         |
| 502  | `PAYMENT_PROVIDER_ERROR` · `UPLOAD_FAILED`                                                                  | Stripe / Cloudinary failed; retry later                                  |
| 503  | `AI_UNAVAILABLE`                                                                                            | Admin description generator only (other AI endpoints degrade silently)   |
| 503  | `PAYMENTS_UNAVAILABLE` · `UPLOADS_UNAVAILABLE` · `SERVICE_UNAVAILABLE`                                      | Integration not configured / DB down                                     |

---

## 7. Rate limits

Responses include IETF `RateLimit` and `RateLimit-Policy` headers. Exceeding a limit returns `429 RATE_LIMITED`.

| Scope                                         | Limit        | Keyed by               |
| --------------------------------------------- | ------------ | ---------------------- |
| All `/api/v1` routes                          | 300 / 15 min | IP                     |
| `POST /auth/login`, `/auth/register` (shared) | 10 / 15 min  | IP                     |
| `POST /auth/refresh`                          | 60 / 15 min  | IP                     |
| `POST /products/:id/reviews`                  | 20 / hour    | user                   |
| `POST /checkout/session`                      | 20 / 15 min  | user                   |
| `POST /coupons/validate`                      | 20 / 15 min  | IP                     |
| `POST /ai/chat`                               | 10 / min     | user, or IP for guests |
| `POST /ai/search`                             | 20 / min     | user or IP             |
| `GET /products/:id/review-summary`            | 30 / min     | user or IP             |
| `GET /ai/recommendations`                     | 20 / min     | user or IP             |
| `POST /ai/admin/generate-description`         | 10 / min     | user                   |

---

## 8. Frontend integration notes

- **Cart sync:** keep the cart in Zustand/localStorage for everyone. On login, `POST /cart/merge`
  with the local items and replace the local cart with the response. While logged in, `PUT /cart`
  (debounced) after changes. On logout, keep or clear the local cart (product choice).
  Use `POST /cart/validate` to price the local cart for guests and before showing checkout.
- **Stock in the UI:** `stock === 0` → out of stock; `stock <= 5` → "Only N left".
- **Images:** `images[0].url` is the primary image; seeded products use placeholder images.
- **Admin product form:** `POST /ai/admin/generate-description` returns a draft. Fill the form
  fields (description, tagline, tags) and let the admin edit before `POST`/`PATCH /products`.
  Then upload images with `POST /products/:id/images` (multipart, field `images`).
- **Graceful AI degradation:** chat → `error` event + fallback content; search → `fallback: true`;
  review summary → hide unless `status === 'ready'`; recommendations → hide reasons when `null`;
  description generator → `503`, keep the form usable.
- **What is not in the API:** password reset emails, product variants (size/color), guest checkout
  (checkout requires login), shipping-rate selection, and real-time order updates (poll instead).
  Ask before building UI that depends on them.
