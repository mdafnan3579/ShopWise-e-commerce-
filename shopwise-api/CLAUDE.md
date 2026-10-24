# ShopWise API — guide for Claude and contributors

Backend for ShopWise, an AI-powered e-commerce platform. Express 5 + MongoDB (Mongoose) +
Zod + the Anthropic SDK. The React frontend is a separate repo and talks to this API over HTTP.

## Commands

| Task                        | Command                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| Install                     | `npm install`                                                               |
| Local MongoDB (replica set) | `docker compose up -d mongo`                                                |
| Dev server (watch mode)     | `npm run dev`                                                               |
| Production start            | `npm start`                                                                 |
| Lint / auto-fix             | `npm run lint` / `npm run lint:fix`                                         |
| Format                      | `npm run format` (check only: `npm run format:check`)                       |
| Tests                       | `npm test` (watch: `npm run test:watch`, coverage: `npm run test:coverage`) |
| Seed database               | `npm run seed`                                                              |

Tests use `mongodb-memory-server` (in-memory replica set) — no Docker or real services needed.

`npm run seed` wipes and reseeds the dev DB (deterministic). Demo logins:
admin `admin@shopwise.dev` / `Admin@12345`, customer `demo@shopwise.dev` / `Demo@12345`.

## Non-negotiable conventions

- **JavaScript only**, no TypeScript. JSDoc where types help.
- **ES modules only**: `import`/`export`, never `require`/`module.exports`.
  `"type": "module"` is set; **relative imports must include the `.js` extension**.
- **No hardcoded secrets.** Everything comes from env vars, validated in `src/config/env.js`.
  Add every new var to `.env.example` and to the Zod schema. Import `env` from config — never
  read `process.env` anywhere else.
- **The Anthropic API key is server-side only** and only touched in `src/ai/client.js`.
- **Money is stored as integer cents** (`priceCents`) to avoid floating-point errors.

## Architecture & layering

```
routes → validate (Zod) → controller → service → model
```

- `src/routes/` — route definitions only (path, middleware, controller). No logic.
- `src/controllers/` — read validated input from `req`, call a service, send the response via
  `utils/apiResponse.js`. Thin.
- `src/services/` — business logic. **Never receives `req`/`res`** — plain arguments in,
  plain data out, throws `AppError`. AI tools reuse services (e.g. `search_products` calls
  `productService.search`).
- `src/models/` — Mongoose schemas, indexes, model statics/hooks.
- `src/middleware/` — auth, requireRole, validate, rateLimit, errorHandler, notFound, requestId.
- `src/validators/` — Zod request schemas, one file per resource.
- `src/ai/` — single Anthropic client (`client.js`), `prompts/` (exported template functions —
  never inline prompt strings), `tools/`, `schemas/` (Zod for AI output), `services/`.
- `src/utils/` — `AppError`, `apiResponse`, `pagination`, small helpers.
- `src/config/` — env loading/validation (fail fast), db, logger.
- `src/scripts/` — seed script.
- `tests/` — `unit/` and `integration/` (Supertest against `createApp()`), `helpers/`.

`src/app.js` exports `createApp()` (no `listen`) so tests can import it;
`src/server.js` connects to the DB, starts listening, and handles graceful shutdown.

### Express 5 note

Express 5 forwards rejected promises from async handlers to the error middleware natively, so
there is **no `asyncHandler` wrapper** — just write `async (req, res) => {}` and `throw`.

## API conventions

- Versioned under `/api/v1`. `GET /health` (and `/api/v1/health`) for liveness/readiness.
- Success: `{ success: true, data, message?, meta? }`
- Error: `{ success: false, error: { code, message, details? } }`
- Throw `new AppError(message, statusCode, code, details)` from services; the central
  `errorHandler` formats every error (incl. Zod, Mongoose cast/duplicate-key, JWT, malformed JSON).
- Error codes are SCREAMING_SNAKE_CASE (`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`,
  `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `AI_UNAVAILABLE`, `INTERNAL_ERROR`, ...).
- List endpoints: `page`, `limit` (max 100), allow-listed `sort`, explicit filters → `meta`
  `{ page, limit, total, totalPages, hasNextPage, hasPrevPage }`.
- Never pass `req.query`/`req.body` straight into a Mongo query — build filters from validated,
  allow-listed fields (NoSQL injection). Defense in depth: Express 5's `simple` query parser (no
  nested objects from the query string) + `middleware/sanitize.js`, which rejects any
  `$`-prefixed or dotted key in body/query/params with 400. (Mongoose's global `sanitizeFilter`
  is deliberately not used: it also neutralizes our own `$gte`/`$in` filters unless every query
  is wrapped in `mongoose.trusted()`.)

## AI conventions

- Models from env: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_FAST_MODEL`
  (default `claude-haiku-5-5`).
- Every AI endpoint has: its own rate limiter, a `max_tokens` cap, a timeout, Zod input length
  limits, and a non-AI fallback. The shop must work with AI fully down.
- Validate all model output with Zod before using it. Treat user content (reviews, chat) as
  untrusted data inside prompts.
- Log token usage per call (`feature`, `model`, tokens, latency) via the logger.
- Tests mock the Anthropic client — the test suite never calls the real API. `tests/setup.js`
  replaces `@anthropic-ai/sdk` globally with `tests/helpers/fakeAnthropic.js`; script responses
  with `fakeAnthropic.enqueue(textResponse(...), toolUseResponse([...]), new Error(...))`.
  An unscripted call throws.
- Layout: `ai/client.js` (only file that touches the SDK: `createMessage`, `createStructured`,
  `streamMessage`, `AIUnavailableError`), `ai/prompts/*` (template functions), `ai/schemas.js`
  (Zod for model output), `ai/tools/` (assistant tools → services: `catalogTools.js` for
  shopping, `supportTools.js` for policies/orders/tickets, `index.js` with `CHAT_TOOLS` and
  `runTool`), `ai/services/*` (one per feature, each with its fallback).
- The chat assistant may only show product ids that a data tool returned in the same turn
  (`show_products` grounding check).
- Support tools query orders only with the signed-in user's id, and never change an order: a
  cancellation is an `action` SSE event that the UI turns into a button calling the normal
  cancel endpoint. Store policies live in `config/support.js`.

## Auth model

- Access token: 15-min HS256 JWT (`sub`, `role`) in the httpOnly `sw_access` cookie (Bearer header
  also accepted). Verified statelessly by `requireAuth`; `requireRole('admin')` after it.
- Refresh token: opaque random string in httpOnly `sw_refresh` (path `/api/v1/auth`), stored only
  as a SHA-256 hash in `RefreshToken`. Rotated on every refresh; reuse of a revoked token revokes
  the whole family. Password/role changes revoke all of a user's tokens.
- CSRF: `verifyOrigin` rejects non-GET requests from unknown `Origin`s.

## Testing

- Use `createTestApp()` (generous rate limits) and `loginAs(app, { role })` from
  `tests/helpers/index.js`. Collections are wiped after every test; each file has its own DB.

## Style

- ESLint (flat config) + Prettier (single quotes, semicolons, 100 cols). Run lint + tests before
  every commit.
- Named exports preferred. File names camelCase; model files PascalCase (`User.js`).
- Use the pino `logger` (or `req.log`), never `console.*`.

## Workflow

Work in phases. End of each phase: `npm run lint && npm test`, fix failures, summarize,
commit, then stop for review.
