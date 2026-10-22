/**
 * @openapi
 * /api/v1/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update name and/or email
 *     description: Changing the email requires `currentPassword`.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               currentPassword: { type: string }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { user: { $ref: '#/components/schemas/User' } } } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { description: 'Not logged in, or wrong current password (`INVALID_CREDENTIALS`)' }
 *       409: { description: 'Email belongs to another account (`EMAIL_TAKEN`)' }
 * /api/v1/users/me/password:
 *   patch:
 *     tags: [Users]
 *     summary: Change password
 *     description: Signs out every other device (all refresh tokens revoked) and issues fresh cookies for this one.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password changed }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/v1/users/me/addresses:
 *   get:
 *     tags: [Users]
 *     summary: List saved addresses
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Addresses
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { addresses: { type: array, items: { $ref: '#/components/schemas/Address' } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     tags: [Users]
 *     summary: Add an address
 *     description: The first address, or one sent with `isDefault true`, becomes the only default. Max 10 addresses (`ADDRESS_LIMIT`).
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/AddressInput' } } }
 *     responses:
 *       201: { description: 'All addresses after the change (`data.addresses`)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/v1/users/me/addresses/{addressId}:
 *   parameters:
 *     - { name: addressId, in: path, required: true, schema: { type: string } }
 *   patch:
 *     tags: [Users]
 *     summary: Update an address (partial)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/AddressInput' } } }
 *     responses:
 *       200: { description: 'All addresses after the change (`data.addresses`)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Users]
 *     summary: Delete an address
 *     description: If the default is deleted, the first remaining address becomes the default.
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: 'All addresses after the change (`data.addresses`)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/v1/users/me/wishlist:
 *   get:
 *     tags: [Users]
 *     summary: Wishlist as product cards (inactive products hidden)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Wishlist
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ProductCard' } } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/v1/users/me/wishlist/{productId}:
 *   parameters:
 *     - { name: productId, in: path, required: true, schema: { type: string } }
 *   post:
 *     tags: [Users]
 *     summary: Add a product to the wishlist (idempotent)
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: 'Updated wishlist (`data.items`)' }
 *       400: { description: 'Wishlist full (`WISHLIST_LIMIT`, max 100)' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Users]
 *     summary: Remove a product from the wishlist
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: 'Updated wishlist (`data.items`)' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
