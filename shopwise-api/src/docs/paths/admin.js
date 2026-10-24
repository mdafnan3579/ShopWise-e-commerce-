/**
 * @openapi
 * /api/v1/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard statistics
 *     description: Revenue counts paid orders only. Defaults to the last 30 days by day. Max range per granularity day 366 days, week 2 years, month 5 years.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: from, in: query, schema: { type: string, format: date-time } }
 *       - { name: to, in: query, schema: { type: string, format: date-time } }
 *       - { name: granularity, in: query, schema: { type: string, enum: [day, week, month], default: day } }
 *     responses:
 *       200:
 *         description: Stats
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/Stats' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /api/v1/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: q, in: query, description: Name or email contains, schema: { type: string } }
 *       - { name: role, in: query, schema: { type: string, enum: [customer, admin] } }
 *       - { name: sort, in: query, schema: { type: string, enum: ['-createdAt', createdAt, name, '-name', email], default: '-createdAt' } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Users
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/User' } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /api/v1/admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Change a user's role
 *     description: You cannot change your own role. The user's sessions are revoked so the new role applies at next login.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [role], properties: { role: { type: string, enum: [customer, admin] } } } } }
 *     responses:
 *       200: { description: 'Updated user (`data.user`)' }
 *       400: { description: '`CANNOT_CHANGE_OWN_ROLE` or validation error' }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/admin/products:
 *   get:
 *     tags: [Admin]
 *     summary: List products including inactive ones
 *     description: Accepts every filter of GET /products plus `status` and `lowStock`.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [all, active, inactive], default: all } }
 *       - { name: lowStock, in: query, description: 'Stock at or below 5', schema: { type: boolean } }
 *       - { name: q, in: query, schema: { type: string } }
 *       - { name: category, in: query, schema: { type: string } }
 *       - { name: sort, in: query, schema: { $ref: '#/components/schemas/ProductSort' } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Products
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/ProductCard' } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /api/v1/admin/orders:
 *   get:
 *     tags: [Admin]
 *     summary: List all orders
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [pending, paid, shipped, delivered, cancelled] } }
 *       - { name: paymentStatus, in: query, schema: { type: string, enum: [unpaid, paid, failed, refunded] } }
 *       - { name: q, in: query, description: Order number or customer name/email, schema: { type: string } }
 *       - { name: from, in: query, schema: { type: string, format: date-time } }
 *       - { name: to, in: query, schema: { type: string, format: date-time } }
 *       - { name: sort, in: query, schema: { type: string, enum: ['-createdAt', createdAt, '-totalCents', totalCents], default: '-createdAt' } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Orders (with `user` populated as name and email)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/Order' } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /api/v1/admin/orders/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Order detail
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     responses:
 *       200: { description: 'Order (`data`)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/admin/orders/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Change order status
 *     description: |
 *       Allowed transitions: pending → cancelled; paid → shipped | cancelled; shipped → delivered.
 *       Cancelling a paid order refunds it through Stripe and restocks the items. Orders can never be marked `paid` here.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [shipped, delivered, cancelled] }
 *               note: { type: string, maxLength: 300 }
 *     responses:
 *       200: { description: 'Updated order (`data`)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: '`INVALID_STATUS_TRANSITION` or `REFUND_UNAVAILABLE`' }
 *       502: { description: 'Refund failed at Stripe (`PAYMENT_PROVIDER_ERROR`); nothing changed' }
 * /api/v1/admin/coupons:
 *   get:
 *     tags: [Admin]
 *     summary: List coupons
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: q, in: query, schema: { type: string } }
 *       - { name: active, in: query, schema: { type: boolean } }
 *       - { name: sort, in: query, schema: { type: string, enum: ['-createdAt', createdAt, code, '-timesUsed'] } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Coupons
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/Coupon' } } }
 *   post:
 *     tags: [Admin]
 *     summary: Create a coupon
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CouponInput' } } }
 *     responses:
 *       201: { description: 'Created coupon (`data`)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       409: { description: Code already exists }
 * /api/v1/admin/coupons/{id}:
 *   parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *   patch:
 *     tags: [Admin]
 *     summary: Update a coupon (partial)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CouponInput' } } }
 *     responses:
 *       200: { description: 'Updated coupon (`data`)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a coupon
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/admin/support-tickets:
 *   get:
 *     tags: [Admin]
 *     summary: List support tickets opened by the AI assistant
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [open, resolved] } }
 *       - { name: priority, in: query, schema: { type: string, enum: [low, normal, high] } }
 *       - { name: category, in: query, schema: { type: string, enum: [refund, return, damaged_or_wrong_item, delivery_problem, cancel_paid_order, account, other] } }
 *       - { name: q, in: query, description: Ticket number, order number or summary contains, schema: { type: string } }
 *       - { name: sort, in: query, schema: { type: string, enum: ['-createdAt', createdAt], default: '-createdAt' } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Tickets, each with `user { name, email }`
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/SupportTicket' } } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /api/v1/admin/support-tickets/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Mark a support ticket open or resolved
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, required: [status], properties: { status: { type: string, enum: [open, resolved] } } } } }
 *     responses:
 *       200: { description: 'Updated ticket (`data`)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
