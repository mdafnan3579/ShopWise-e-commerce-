/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a customer account and start a session
 *     description: Sets the httpOnly `sw_access` (15 min) and `sw_refresh` (7 days, path /api/v1/auth) cookies. A `role` field in the body is ignored. Rate limited (10 per 15 min per IP, shared with login).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 80 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, description: 'At least one letter and one number, max 72 bytes' }
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       409: { description: 'Email already registered (`EMAIL_TAKEN`)' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and start a session
 *     description: Returns the same `INVALID_CREDENTIALS` error for an unknown email and a wrong password. Sets auth cookies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: demo@shopwise.dev }
 *               password: { type: string, example: Demo@12345 }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { description: 'Invalid email or password (`INVALID_CREDENTIALS`)' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate the refresh token and issue a new access token
 *     description: |
 *       Reads the `sw_refresh` cookie. Every call invalidates the presented refresh token and sets new cookies.
 *       Re-using an already-rotated token revokes the whole session family (`REFRESH_TOKEN_REUSED`).
 *       Clients should de-duplicate concurrent refresh calls (one in-flight refresh shared by all requests).
 *     responses:
 *       200:
 *         description: New session cookies set
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } } }
 *       401: { description: '`REFRESH_TOKEN_MISSING`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED` or `REFRESH_TOKEN_REUSED`. Cookies are cleared.' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the refresh token and clear cookies
 *     description: Always succeeds, even without a session.
 *     responses:
 *       200: { description: Logged out }
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The logged-in user
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
