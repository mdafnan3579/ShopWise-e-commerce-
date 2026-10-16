# syntax=docker/dockerfile:1

# ---- Dependencies: production packages only ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Runtime: small image, non-root user ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 5000

# Uses the app's own readiness endpoint (503 when MongoDB is down).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run node directly (not via npm) so SIGTERM reaches the app and graceful shutdown runs.
CMD ["node", "src/server.js"]
