# Security review

Review of the ShopWise API covering the three areas requested (NoSQL injection, missing auth
checks, unsafe CORS) plus the wider OWASP API Top 10. Each item lists the protection and where
it is enforced or tested.

## Findings fixed during the review

| #   | Finding                                                                                                                                                | Fix                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /coupons/validate` only had the global limit (300 / 15 min), so short codes like `SAVE20` could be brute-forced.                                 | Dedicated limiter, 20 / 15 min per IP (`coupon` in `middleware/rateLimit.js`). Test: `cart.test.js › rate limits coupon guessing`. |
| 2   | The `urlencoded` body parser was enabled although the API is JSON-only. A cross-site HTML form (the classic CSRF vehicle) could deliver a parsed body. | Parser removed. Form posts now arrive with an empty body and fail validation. Test: `app.test.js › ignores form-encoded bodies`.   |

## NoSQL injection

| Protection                                                                                                                                                         | Where                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Every route validates `params`, `query` and `body` with Zod. Wrong types (e.g. `{ "$ne": null }` where a string is expected) are rejected before any handler runs. | `middleware/validate.js`, `validators/*`                                         |
| Any key starting with `$` or containing `.` anywhere in the request is rejected with 400 `INVALID_INPUT`.                                                          | `middleware/sanitize.js`, test `app.test.js`                                     |
| The query string is parsed with Express's `simple` parser, so `?email[$ne]=x` stays a plain string.                                                                | `app.js`                                                                         |
| Filters are built field by field from allow-listed, validated values. Request objects are never passed to Mongo.                                                   | `product.service.js › buildProductFilter`, `order.service.js`, `user.service.js` |
| User text used in `$regex` is escaped, which prevents both regex injection and ReDoS. Tests send `.*` and expect no results.                                       | `utils/regex.js`                                                                 |
| Sort fields come from an allow-list enum.                                                                                                                          | `utils/pagination.js`, validators                                                |
| Model output (AI tool inputs, structured output) is Zod-validated before it reaches a query.                                                                       | `ai/tools/index.js`, `ai/schemas.js`                                             |

## Authentication and authorization

| Check                                                                                                                                                                               | Where                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| All admin endpoints are behind one router-level guard (`requireAuth` + `requireRole('admin')`). Product and AI admin writes use the same pair per route.                            | `routes/admin.routes.js`, `routes/product.routes.js`, `routes/ai.routes.js`       |
| Ownership is enforced in the query itself (`{ _id, user }`), and another user's order or chat session returns 404, not 403, so ids can't be probed.                                 | `order.service.js`, `chat.service.js`, tests in `orders.test.js` and `ai.test.js` |
| Reviews: only the author edits; author or admin deletes.                                                                                                                            | `review.service.js`, `reviews.test.js`                                            |
| Mass assignment: Zod strips unknown keys, so `role`, `averageRating`, `paymentStatus` and similar fields can't be set by clients. Tests try to self-assign `admin`.                 | validators, `auth.test.js`                                                        |
| JWTs: HS256 pinned (blocks `alg: none` and algorithm confusion), issuer and audience checked, 15-minute lifetime. Tests try forged and unsigned tokens.                             | `token.service.js`, `auth.test.js`                                                |
| Refresh tokens: opaque, stored hashed, rotated on every use, with family revocation on reuse. A password change or role change revokes all of the user's sessions.                  | `token.service.js`, `auth.test.js`                                                |
| Login gives the same error for an unknown email and a wrong password, and runs a dummy bcrypt comparison so timing matches. Credential endpoints are limited to 10 / 15 min per IP. | `auth.service.js`, `auth.routes.js`                                               |
| Passwords: bcrypt cost 12, 8 to 72 bytes (longer input is rejected rather than silently truncated).                                                                                 | `models/User.js`, `validators/common.js`                                          |
| Only the verified Stripe webhook can mark an order paid. The admin status API cannot set `paid`.                                                                                    | `webhook.service.js`, `commerce.validators.js`, `orders.test.js`                  |
| Every endpoint in the route table was checked for the guard it needs; `docs.test.js` lists every route, and the OpenAPI `security` field documents which ones require auth.         | `docs/paths/*`                                                                    |

## CORS and CSRF

| Protection                                                                                                                                                        | Where                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Exact-match origin allow-list from `CLIENT_URL` with no wildcard and no reflection of arbitrary origins. `credentials: true` is only granted to listed origins.   | `app.js`, `app.test.js`                      |
| Auth cookies are `httpOnly`, `Secure` in production (forced whenever `SameSite=None`), `SameSite=Lax` by default. The refresh cookie is scoped to `/api/v1/auth`. | `utils/cookies.js`                           |
| CSRF: state-changing requests from an `Origin` that isn't allow-listed get 403 `CSRF_REJECTED`. JSON-only bodies (finding 2) back this up.                        | `middleware/verifyOrigin.js`, `auth.test.js` |

## Other controls

- **Payments:** prices, discounts, tax and shipping are recomputed server-side. The client sends only ids and quantities. The webhook verifies its signature over the raw body and is idempotent. Stock decrements are conditional, so stock can't go negative.
- **Rate limiting:** a global limiter plus per-feature limiters (auth, refresh, reviews, checkout, coupons, every AI endpoint). AI limits are per user when logged in.
- **AI / prompt injection:** the API key is server-side only. Tools are read-only. Untrusted text (reviews, queries, catalog data) is wrapped and labelled as data. Product ids the model shows must come from tool results. Inputs are length-capped, and `max_tokens`, timeouts and round limits cap cost. `AI_ENABLED=false` is a kill switch.
- **Uploads:** images only (MIME allow-list), 5 MB, 5 files per request, held in memory and never written to disk.
- **Resource limits:** 100 kb JSON body limit, page size capped at 100, analytics range capped per granularity.
- **Information leakage:** unexpected errors return a generic 500 outside development. Logs redact cookies, authorization headers and password and token fields. `X-Powered-By` is removed and helmet sets security headers.
- **Email:** user-supplied values are HTML-escaped in templates.
- **Operations:** env validation fails fast. The container runs as a non-root user. The seed script refuses to run in production without `--force`. `npm audit --omit=dev` runs in CI (0 vulnerabilities at review time).

## Accepted risks / future work

- `POST /auth/register` reveals whether an email is registered (409 `EMAIL_TAKEN`). This is a usability trade-off accepted by most shops. It is mitigated by the 10 / 15 min credential rate limit.
- Rate-limit counters are in process memory. A multi-instance deployment should use a shared store such as Redis.
- Coupon usage limits are checked at checkout and incremented on payment, so two concurrent checkouts can overshoot a limit by one. Reserving usage at checkout would close this gap.
- Access tokens are stateless, so a role downgrade takes effect within 15 minutes, when the next refresh fails.
