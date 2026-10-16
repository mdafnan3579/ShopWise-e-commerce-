/**
 * @openapi
 * /api/v1/products:
 *   get:
 *     tags: [Products]
 *     summary: List and search active products
 *     description: Full-text search (`q`) ranks by relevance and falls back to partial matching when no whole word matches.
 *     parameters:
 *       - { name: q, in: query, schema: { type: string, maxLength: 100 } }
 *       - { name: category, in: query, schema: { type: string } }
 *       - { name: brand, in: query, schema: { type: string } }
 *       - { name: minPriceCents, in: query, schema: { type: integer } }
 *       - { name: maxPriceCents, in: query, schema: { type: integer } }
 *       - { name: minRating, in: query, schema: { type: number, minimum: 0, maximum: 5 } }
 *       - { name: inStock, in: query, schema: { type: boolean } }
 *       - { name: tags, in: query, description: Comma-separated, schema: { type: string, example: 'waterproof,running' } }
 *       - { name: sort, in: query, description: 'Default `relevance` with q, else `-createdAt`', schema: { $ref: '#/components/schemas/ProductSort' } }
 *       - { $ref: '#/components/parameters/Page' }
 *       - { $ref: '#/components/parameters/Limit' }
 *     responses:
 *       200:
 *         description: Product cards
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/ProductCard' } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *   post:
 *     tags: [Products]
 *     summary: Create a product (admin)
 *     description: The slug is generated from the name and made unique (`-2`, `-3`, ...) unless provided.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ProductInput' } } }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/Product' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 * /api/v1/products/categories:
 *   get:
 *     tags: [Products]
 *     summary: All categories with active product counts
 *     responses:
 *       200:
 *         description: Categories
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/Category' } } }
 * /api/v1/products/{id}:
 *   parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *   get:
 *     tags: [Products]
 *     summary: Product detail by id or slug
 *     description: The path segment may be the product id or its slug. Includes `ratingBreakdown`. Inactive products are visible to admins only.
 *     parameters:
 *       - { name: id, in: path, required: true, description: Product id or slug, schema: { type: string }, example: stride-trail-runner-gtx }
 *     responses:
 *       200:
 *         description: Product
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { $ref: '#/components/schemas/ProductDetail' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Products]
 *     summary: Update a product (admin, partial)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ProductInput' } } }
 *     responses:
 *       200: { description: 'Updated product (`data`)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: 'Slug already used (`CONFLICT`)' }
 *   delete:
 *     tags: [Products]
 *     summary: Deactivate a product (admin, soft delete)
 *     description: Hidden from the storefront; order history and reviews stay intact.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: Deactivated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/products/{id}/related:
 *   get:
 *     tags: [Products]
 *     summary: Up to 8 top-rated products from the same category
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     responses:
 *       200:
 *         description: Related products
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: array, items: { $ref: '#/components/schemas/ProductCard' } } }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/products/{id}/images:
 *   post:
 *     tags: [Products]
 *     summary: Upload product images (admin, multipart)
 *     description: Field `images`, 1 to 5 files per request, JPEG/PNG/WebP/AVIF, max 5 MB each, max 8 per product. Stored on Cloudinary.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters: [{ $ref: '#/components/parameters/IdPath' }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: 'Product with new images (`data`)' }
 *       400: { description: '`INVALID_FILE_TYPE`, `IMAGE_LIMIT`, `UPLOAD_ERROR`' }
 *       413: { description: 'File too large (`FILE_TOO_LARGE`)' }
 *       502: { description: 'Cloudinary failed (`UPLOAD_FAILED`)' }
 *       503: { description: 'Uploads not configured (`UPLOADS_UNAVAILABLE`)' }
 * /api/v1/products/{id}/images/{imageId}:
 *   delete:
 *     tags: [Products]
 *     summary: Remove a product image (admin)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { $ref: '#/components/parameters/IdPath' }
 *       - { name: imageId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 'Product without the image (`data`)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
