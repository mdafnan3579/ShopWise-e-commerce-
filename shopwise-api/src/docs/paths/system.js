/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Liveness and readiness check
 *     description: 200 when the API and MongoDB are up, 503 when the database is unreachable.
 *     responses:
 *       200:
 *         description: Healthy
 *         content:
 *           application/json:
 *             example: { success: true, data: { status: ok, version: 0.1.0, uptimeSeconds: 42, timestamp: '2026-10-16T12:00:00.000Z', checks: { database: connected } } }
 *       503:
 *         description: Database unavailable (`SERVICE_UNAVAILABLE`)
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 * /api/v1/health:
 *   get:
 *     tags: [System]
 *     summary: Same as /health, under the versioned prefix
 *     responses:
 *       200: { description: Healthy }
 *       503: { description: Database unavailable }
 */
