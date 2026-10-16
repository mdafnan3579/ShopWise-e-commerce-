# Deploying ShopWise API to Render

The API ships as a Docker image (`Dockerfile`) and includes a Render Blueprint (`render.yaml`).
MongoDB is hosted on MongoDB Atlas (free tier works).

## 1. MongoDB Atlas

1. Create a free **M0** cluster at <https://cloud.mongodb.com>. Atlas clusters are replica sets,
   so the transactions used by the Stripe webhook work out of the box.
2. **Database Access** → add a user with _Read and write to any database_.
3. **Network Access** → allow `0.0.0.0/0` (Render's free tier has no static outbound IPs).
4. **Connect → Drivers** → copy the `mongodb+srv://...` string and add the database name:
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/shopwise?retryWrites=true&w=majority`

## 2. Third-party keys (all test mode)

| Service    | What you need                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Stripe     | A sandbox. Create a **restricted key** (`rk_test_...`) with write access to Checkout Sessions, Coupons and Refunds.   |
| Cloudinary | Cloud name, API key and API secret from the dashboard.                                                                |
| Anthropic  | An API key from <https://console.anthropic.com>. Optional: without it every AI feature falls back to non-AI behavior. |
| Email      | Any SMTP provider (Resend, Postmark, Mailtrap...). Optional: without it emails are logged.                            |

## 3. Create the Render service

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, pick the repository. Render reads `render.yaml`.
3. Fill in the secret values it asks for:
   - `CLIENT_URL`: your frontend origin(s), comma-separated, e.g. `https://shopwise.vercel.app`
   - `MONGODB_URI`: the Atlas string from step 1
   - Stripe, Cloudinary, Anthropic and SMTP values from step 2
   - `JWT_ACCESS_SECRET` is generated automatically.
4. Deploy. Render builds the image and routes traffic once `GET /health` returns 200.

`TRUST_PROXY=1` (Render's load balancer) makes rate limiting see real client IPs, and
`COOKIE_SAMESITE=none` lets the browser send auth cookies from the frontend's domain to the
API's domain (cookies are then automatically `Secure`). The API refuses to start if a
production-required variable is missing, and the error lists every missing one.

## 4. Stripe webhook

1. Stripe Dashboard (sandbox) → **Developers → Webhooks → Add endpoint**
   - URL: `https://<your-service>.onrender.com/api/v1/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
2. Copy the endpoint's signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` on Render and
   redeploy.

For local development use the Stripe CLI instead:

```bash
stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe
# copy the printed whsec_... into .env as STRIPE_WEBHOOK_SECRET
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

## 5. Seed demo data (optional)

The seed refuses to run against production unless forced:

```bash
MONGODB_URI="mongodb+srv://..." NODE_ENV=production node src/scripts/seed.js --force
```

## 6. Verify

```bash
curl https://<your-service>.onrender.com/health
open https://<your-service>.onrender.com/api/docs
```

Free Render instances sleep after inactivity; the first request after a while takes ~30–60 s.
