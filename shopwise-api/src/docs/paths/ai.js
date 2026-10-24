/**
 * @openapi
 * /api/v1/ai/chat:
 *   post:
 *     tags: [AI]
 *     summary: Shopping and customer support assistant (Server-Sent Events stream)
 *     description: |
 *       Streams one assistant turn as `text/event-stream`. Works for guests (an httpOnly `sw_guest` cookie scopes their sessions) and logged-in users.
 *       Signed-in customers also get support: store policies, their own orders, a cancel button for pending unpaid orders, and support tickets for the human team.
 *       Send `sessionId` from a previous `session` event to continue a conversation.
 *
 *       Each event is `event: <name>` + `data: <json>`, separated by a blank line. Lines starting with `:` are keep-alive comments.
 *
 *       | event | data | when |
 *       |---|---|---|
 *       | `session` | `{ sessionId }` | first event |
 *       | `text` | `{ delta }` | Markdown text chunks, append in order |
 *       | `tool` | `{ name, status: "running" }` | the assistant is searching / checking stock |
 *       | `products` | `{ products: ProductCard[] }` | cards to render under the reply |
 *       | `action` | `{ type: "cancel_order", orderId, orderNumber, totalCents }` | show a confirm button; clicking it calls `POST /orders/{id}/cancel` |
 *       | `error` | `{ code: "AI_UNAVAILABLE", message }` | AI failed; a fallback reply and top-rated products follow |
 *       | `done` | `{ sessionId, usage, fallback? }` | always last |
 *
 *       Errors before the stream starts (validation, unknown session, rate limit) are normal JSON error responses.
 *       Max 1,000 characters per message; 10 requests per minute per user or IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, minLength: 1, maxLength: 1000, example: 'Waterproof running shoes under $100?' }
 *               sessionId: { type: string }
 *     responses:
 *       200:
 *         description: Event stream
 *         content:
 *           text/event-stream:
 *             example: "event: session\ndata: {\"sessionId\":\"6650f1c2a1b2c3d4e5f60789\"}\n\nevent: tool\ndata: {\"name\":\"search_products\",\"status\":\"running\"}\n\nevent: text\ndata: {\"delta\":\"Here are \"}\n\nevent: products\ndata: {\"products\":[]}\n\nevent: done\ndata: {\"sessionId\":\"6650f1c2a1b2c3d4e5f60789\",\"usage\":{}}\n\n"
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { description: Session not found or not yours }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/ai/chat/sessions/{id}:
 *   parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *   get:
 *     tags: [AI]
 *     summary: Load a conversation (owner only), with product cards per message
 *     responses:
 *       200:
 *         description: Session
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/ChatSession' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [AI]
 *     summary: Delete a conversation (owner only)
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/ai/search:
 *   post:
 *     tags: [AI]
 *     summary: Natural-language product search
 *     description: |
 *       Claude turns the query into filters (category, price range, keywords, minimum rating, sort), which run as a normal database query.
 *       `chips` are ready-made labels for removable filter chips. If keywords plus filters match nothing, keywords are dropped (`relaxed: true`).
 *       If the AI fails, plain text search runs instead (`fallback: true`, `interpretedFilters: null`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string, minLength: 2, maxLength: 200, example: 'waterproof running shoes under $100 with good reviews' }
 *               page: { type: integer, default: 1 }
 *               limit: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Results and the interpretation
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         products: { type: array, items: { $ref: '#/components/schemas/ProductCard' } }
 *                         interpretedFilters:
 *                           type: [object, 'null']
 *                           properties:
 *                             keywords: { type: string }
 *                             category: { type: string }
 *                             minPrice: { type: number, description: US dollars }
 *                             maxPrice: { type: number, description: US dollars }
 *                             minRating: { type: number }
 *                             inStockOnly: { type: boolean }
 *                             sort: { type: string, enum: [relevance, price_asc, price_desc, rating, newest] }
 *                         chips: { type: array, items: { $ref: '#/components/schemas/SearchFilterChip' } }
 *                         summary: { type: [string, 'null'], example: 'Showing results for: Shoes, Under $100, 4+ stars' }
 *                         fallback: { type: boolean }
 *                         relaxed: { type: boolean }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/products/{id}/review-summary:
 *   get:
 *     tags: [AI]
 *     summary: AI pros/cons summary of a product's reviews
 *     description: |
 *       Always 200. Show the card only when `status` is `ready` (label it AI-generated).
 *       Needs at least 3 reviews. Cached on the product; regenerated only when reviews changed and the summary is older than 24 hours.
 *       On AI failure, a stale cached summary is returned (`stale: true`) or `status: unavailable`.
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     responses:
 *       200:
 *         description: Summary state
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/ReviewSummary' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/ai/recommendations:
 *   get:
 *     tags: [AI]
 *     summary: Personalized recommendations ("Picked for you")
 *     description: |
 *       Logged in with order history or a wishlist: up to 6 products ranked by Claude, each with a one-sentence `reason` (`source: ai`, cached 1 hour).
 *       Guests and new users: top-rated products, `reason: null` (`source: top_rated`). AI failure: rating-sorted candidates (`source: fallback`).
 *     responses:
 *       200:
 *         description: Recommendations
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         source: { type: string, enum: [ai, fallback, top_rated] }
 *                         cached: { type: boolean }
 *                         generatedAt: { type: string, format: date-time }
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               product: { $ref: '#/components/schemas/ProductCard' }
 *                               reason: { type: [string, 'null'] }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/ai/admin/generate-description:
 *   post:
 *     tags: [AI]
 *     summary: Generate product copy (admin)
 *     description: Returns a draft description, tagline and tags for the admin to edit before saving.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category, features]
 *             properties:
 *               name: { type: string, example: Aurora ANC Wireless Headphones }
 *               category: { type: string, example: electronics }
 *               brand: { type: string }
 *               features: { type: array, minItems: 1, maxItems: 12, items: { type: string }, example: ['40h battery', 'Adaptive noise cancelling'] }
 *               audience: { type: string }
 *     responses:
 *       200:
 *         description: Draft copy
 *         content:
 *           application/json:
 *             example: { success: true, data: { description: '...', tagline: 'Silence the world', tags: [wireless, noise-cancelling], aiGenerated: true } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       503: { $ref: '#/components/responses/AIUnavailable' }
 */
