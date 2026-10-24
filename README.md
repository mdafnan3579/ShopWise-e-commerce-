# ShopWise

[![CI](https://github.com/mdafnan3579/ShopWise-e-commerce-/actions/workflows/ci.yml/badge.svg)](https://github.com/mdafnan3579/ShopWise-e-commerce-/actions/workflows/ci.yml)

An AI-powered e-commerce platform: a Node.js/Express API and a React storefront with an admin panel,
Stripe checkout and a Claude-powered shopping and customer support assistant.

| Folder                             | What it is                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`shopwise-api/`](./shopwise-api/) | REST API: Express 5, MongoDB, Stripe, Claude (AI assistant, search, review summaries). See its [README](./shopwise-api/README.md) and [API.md](./shopwise-api/API.md). |
| [`shopwise-web/`](./shopwise-web/) | React storefront and admin panel: Vite, React Router, TanStack Query, Tailwind. See its [README](./shopwise-web/README.md).                                            |

## Run it locally

You need Node.js 24 and MongoDB running as a replica set (see the API README).

```bash
git clone https://github.com/mdafnan3579/ShopWise-e-commerce-.git shopwise
cd shopwise

# 1. API on http://localhost:5000
cd shopwise-api
npm install
cp .env.example .env   # fill in MongoDB, and optionally Stripe / Anthropic / Cloudinary keys
npm run seed           # demo data
npm run dev

# 2. Web app on http://localhost:5173 (in a second terminal)
cd shopwise-web
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:5000
npm run dev
```

Open <http://localhost:5173> (use `localhost`, not `127.0.0.1`, so the auth cookies work).
Demo logins: `demo@shopwise.dev` / `Demo@12345` (customer) and `admin@shopwise.dev` / `Admin@12345` (admin).

## Deploy

API on Render (Docker, `render.yaml`) with MongoDB Atlas, web app on Vercel (`shopwise-web/vercel.json`).
Step by step, including the Stripe webhook and cookie notes: [shopwise-api/docs/DEPLOYMENT.md](./shopwise-api/docs/DEPLOYMENT.md).

`support-agent/` is a separate, terminal-only tutorial that builds the support agent step by step.
It is not deployed; the same ideas run in production inside the website's chat assistant.
