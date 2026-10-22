# ShopWise Web

React storefront and admin panel for **ShopWise**, an AI-powered e-commerce platform. It talks to
the [ShopWise API](https://github.com/mdafnan3579/ShopWise-e-commerce-) over HTTP and is built
strictly against its contract, [API.md](./API.md).

## Features

**Store**

- Catalog with category, price, rating and stock filters, all mirrored in the URL
- **AI search** in plain English (“waterproof running shoes under $100”) with removable filter chips
- **AI shopping assistant**: streaming chat (SSE) with product cards, a stop button and saved history
- **AI review summaries** (pros and cons) and personalized recommendations, clearly labelled
- Product pages with gallery, reviews (write, edit, delete) and related products
- Cart for guests and users: kept in localStorage, merged into the account on login, then synced
- Coupons, server-priced totals, Stripe-hosted checkout and a success page that polls for payment
- Account: profile, password, address book, wishlist, order history and cancellation

**Admin** (`/admin`)

- Dashboard: revenue chart, KPIs vs the previous period, orders by status, top products, low stock
- Products: create, edit, deactivate, image upload and an **AI description writer**
- Orders: search, filters, status changes (ship, deliver, cancel and refund)
- Users (role changes) and coupons (full CRUD)

Every AI feature degrades gracefully: with no Anthropic key the shop still works with plain fallbacks.

## Tech stack

React 19 · Vite 8 · React Router 8 · TanStack Query 5 · Zustand · axios · Tailwind CSS 4 ·
Recharts · lucide-react · sonner · Vitest + Testing Library · ESLint + Prettier. JavaScript only,
matching the API.

## Getting started

Prerequisites: Node.js 24 and the ShopWise API running on `http://localhost:5000` (see its README).

```bash
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:5000
npm run dev             # http://localhost:5173
```

Open the app at **http://localhost:5173** (not `127.0.0.1`): the API only accepts requests from
the origin in its `CLIENT_URL`, and auth cookies are scoped to `localhost`.

Demo accounts (after `npm run seed` in the API): customer `demo@shopwise.dev` / `Demo@12345`,
admin `admin@shopwise.dev` / `Admin@12345`. The login page has one-click buttons for both.
Coupons: `WELCOME10`, `SAVE20`. Stripe test card: `4242 4242 4242 4242`.

| Script            | Purpose                    |
| ----------------- | -------------------------- |
| `npm run dev`     | Dev server with hot reload |
| `npm run build`   | Production build to `dist` |
| `npm run preview` | Serve the production build |
| `npm run lint`    | ESLint                     |
| `npm test`        | Unit tests (Vitest)        |
| `npm run format`  | Prettier                   |

## How it fits the API

- **Auth** is cookie-based (`withCredentials`). The app never sees tokens. On load it calls
  `GET /auth/me`, then tries `POST /auth/refresh` once. An axios interceptor refreshes expired
  access tokens and shares **one in-flight refresh** between concurrent requests, because refresh
  tokens rotate and replaying one logs the user out everywhere (`src/lib/api.js`).
- **Cart sync** (`src/components/CartSync.jsx`): on login the guest cart is merged with
  `POST /cart/merge`. Later changes are pushed with a debounced `PUT /cart`. The cart records which
  user it was synced for, so a reload replaces the server cart instead of merging it twice.
- **Prices are never computed client-side.** Every total comes from `POST /cart/validate`.
- **Chat streaming** uses `fetch` + a stream reader, since `EventSource` cannot POST (`src/lib/chat.js`).
- The admin panel is lazy-loaded, so shoppers never download the chart library.

## Project structure

```
src/
  api/endpoints.js     every API call, grouped by resource
  lib/                 axios client + refresh, SSE chat client, formatting, hooks
  stores/              Zustand: auth session, persisted cart
  components/          layout, product cards, chat widget, cart sync, shared UI
  pages/               store pages, account/, admin/ (lazy-loaded)
tests/                 unit tests
```
