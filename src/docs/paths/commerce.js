/**
 * @openapi
 * /api/v1/cart/validate:
 *   post:
 *     tags: [Cart]
 *     summary: Price any cart (guests included)
 *     description: Recomputes every price from the database. Duplicate lines are merged; stock problems are reported in `issues`, an invalid coupon in `couponError`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items: { type: array, maxItems: 50, items: { $ref: '#/components/schemas/CartItemInput' } }
 *               couponCode: { type: string, example: WELCOME10 }
 *     responses:
 *       200:
 *         description: Priced cart
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/CartPricing' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 * /api/v1/cart:
 *   get:
 *     tags: [Cart]
 *     summary: The saved cart, priced
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: 'Priced cart (`data`, same shape as /cart/validate)' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   put:
 *     tags: [Cart]
 *     summary: Replace the saved cart
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [items], properties: { items: { type: array, items: { $ref: '#/components/schemas/CartItemInput' } } } }
 *     responses:
 *       200: { description: 'Priced cart (`data`)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   delete:
 *     tags: [Cart]
 *     summary: Empty the saved cart
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: Cleared }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/v1/cart/merge:
 *   post:
 *     tags: [Cart]
 *     summary: Merge a guest (localStorage) cart into the saved cart after login
 *     description: Quantities of the same product are added, capped at 10.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [items], properties: { items: { type: array, items: { $ref: '#/components/schemas/CartItemInput' } } } }
 *     responses:
 *       200: { description: 'Priced merged cart (`data`)' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/v1/coupons/validate:
 *   post:
 *     tags: [Cart]
 *     summary: Check a coupon against a cart
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, items]
 *             properties:
 *               code: { type: string }
 *               items: { type: array, minItems: 1, items: { $ref: '#/components/schemas/CartItemInput' } }
 *     responses:
 *       200: { description: '`data.coupon`, `data.discountCents` and the full priced cart in `data.totals`' }
 *       400: { description: '`INVALID_COUPON`, `COUPON_EXPIRED`, `COUPON_USAGE_LIMIT`, `COUPON_MIN_SUBTOTAL` or `VALIDATION_ERROR`' }
 * /api/v1/checkout/session:
 *   post:
 *     tags: [Checkout & Orders]
 *     summary: Start Stripe Checkout
 *     description: |
 *       Re-prices the cart server-side, creates a `pending` order and a Stripe Checkout Session, and returns its `url`.
 *       Redirect the browser to `url`. Stripe returns the customer to `/checkout/success?session_id=...` or `/cart?checkout=cancelled` on the client.
 *       The order becomes `paid` only when the verified Stripe webhook arrives; poll `GET /orders/me/by-session/{sessionId}`.
 *       Provide exactly one of `addressId` (saved address) or `shippingAddress`.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items: { type: array, minItems: 1, items: { $ref: '#/components/schemas/CartItemInput' } }
 *               couponCode: { type: string }
 *               addressId: { type: string }
 *               shippingAddress: { $ref: '#/components/schemas/ShippingAddress' }
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             example: { success: true, data: { orderId: 6650f1c2a1b2c3d4e5f60789, orderNumber: SW-MG7K2P-9F3A1C, sessionId: cs_test_a1b2, url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2' } }
 *       400: { description: '`VALIDATION_ERROR`, `EMPTY_CART` or a coupon error code' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { description: 'Saved address not found' }
 *       409: { description: 'Cart has stock/availability problems (`CART_ISSUES`, details = issues)' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       502: { description: 'Stripe error (`PAYMENT_PROVIDER_ERROR`)' }
 *       503: { description: 'Payments not configured (`PAYMENTS_UNAVAILABLE`)' }
 * /api/v1/orders/me:
 *   get:
 *     tags: [Checkout & Orders]
 *     summary: Your orders, newest first
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [pending, paid, shipped, delivered, cancelled] } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Orders
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/Order' } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/v1/orders/me/{id}:
 *   get:
 *     tags: [Checkout & Orders]
 *     summary: One of your orders
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     responses:
 *       200:
 *         description: Order
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/Order' } }
 *       404: { description: 'Not found (also returned for other users’ orders)' }
 * /api/v1/orders/me/by-session/{sessionId}:
 *   get:
 *     tags: [Checkout & Orders]
 *     summary: Find your order by Stripe Checkout Session id (success page)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: sessionId, in: path, required: true, schema: { type: string, example: cs_test_a1b2 } }
 *     responses:
 *       200: { description: 'Order (`data`); `paymentStatus` may still be `unpaid` until the webhook arrives' }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/orders/{id}/cancel:
 *   post:
 *     tags: [Checkout & Orders]
 *     summary: Cancel your unpaid order
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     responses:
 *       200: { description: 'Cancelled order (`data`)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: 'Already paid or not pending (`ORDER_NOT_CANCELLABLE`)' }
 * /api/v1/webhooks/stripe:
 *   post:
 *     tags: [Webhooks]
 *     summary: Stripe webhook (called by Stripe, not by clients)
 *     description: |
 *       Verifies the `Stripe-Signature` header against the raw body. Handles `checkout.session.completed`,
 *       `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`.
 *       Idempotent: each event id is recorded in the same transaction as its effects.
 *     parameters:
 *       - { name: Stripe-Signature, in: header, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, description: Stripe Event } } }
 *     responses:
 *       200: { description: 'Processed or acknowledged (`{ received: true, handled, duplicate }`)' }
 *       400: { description: 'Missing or invalid signature (`INVALID_SIGNATURE`)' }
 *       500: { description: Processing failed; Stripe will retry }
 */
