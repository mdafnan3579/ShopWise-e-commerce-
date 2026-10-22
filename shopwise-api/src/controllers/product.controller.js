import * as productService from '../services/product.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

export async function listProducts(req, res) {
  const { items, meta } = await productService.searchProducts(req.validated.query);
  sendSuccess(res, { data: items, meta });
}

export async function adminListProducts(req, res) {
  const { items, meta } = await productService.searchProducts(req.validated.query, {
    admin: true,
  });
  sendSuccess(res, { data: items, meta });
}

export async function getCategories(_req, res) {
  sendSuccess(res, { data: await productService.getCategories() });
}

export async function getProduct(req, res) {
  const product = await productService.getProductDetail(req.validated.params.idOrSlug, {
    admin: req.user?.role === 'admin',
  });
  sendSuccess(res, { data: product });
}

export async function getRelated(req, res) {
  sendSuccess(res, { data: await productService.getRelatedProducts(req.validated.params.id) });
}

export async function createProduct(req, res) {
  const product = await productService.createProduct(req.validated.body);
  sendCreated(res, { data: product, message: 'Product created' });
}

export async function updateProduct(req, res) {
  const product = await productService.updateProduct(req.validated.params.id, req.validated.body);
  sendSuccess(res, { data: product, message: 'Product updated' });
}

export async function deleteProduct(req, res) {
  await productService.deactivateProduct(req.validated.params.id);
  sendSuccess(res, { message: 'Product deactivated' });
}

export async function uploadImages(req, res) {
  const product = await productService.addProductImages(req.validated.params.id, req.files);
  sendCreated(res, { data: product, message: 'Images uploaded' });
}

export async function deleteImage(req, res) {
  const { id, imageId } = req.validated.params;
  const product = await productService.removeProductImage(id, imageId);
  sendSuccess(res, { data: product, message: 'Image removed' });
}
