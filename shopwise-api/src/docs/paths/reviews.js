/**
 * @openapi
 * /api/v1/products/{id}/reviews:
 *   parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *   get:
 *     tags: [Reviews]
 *     summary: List a product's reviews
 *     parameters:
 *       - { name: sort, in: query, schema: { type: string, enum: ['-createdAt', createdAt, '-rating', rating], default: '-createdAt' } }
 *       - { name: rating, in: query, schema: { type: integer, minimum: 1, maximum: 5 } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Reviews (reviewer exposed as `{ _id, name }` only)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/Review' } } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [Reviews]
 *     summary: Review a product (one per user per product)
 *     description: Recalculates the product's average rating. `verifiedPurchase` is set when the user has a paid order for the product.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ReviewInput' } } }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/Review' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: 'Already reviewed (`ALREADY_REVIEWED`)' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 * /api/v1/reviews/{id}:
 *   parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *   patch:
 *     tags: [Reviews]
 *     summary: Edit your review (partial)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ReviewInput' } } }
 *     responses:
 *       200: { description: 'Updated review (`data`)' }
 *       403: { description: Not your review }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review (author or admin)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
