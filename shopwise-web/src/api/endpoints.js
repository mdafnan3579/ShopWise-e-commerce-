import { http, unwrap, unwrapList } from '../lib/api.js';

/** Drops empty values so filters map cleanly onto query strings. */
function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

// --- Auth (API.md §4 Auth) ---
export const authApi = {
  me: () => http.get('/auth/me', { _skipRefresh: true }).then(unwrap),
  login: (body) => http.post('/auth/login', body).then(unwrap),
  register: (body) => http.post('/auth/register', body).then(unwrap),
  logout: () => http.post('/auth/logout').then(unwrap),
};

// --- Users ---
export const userApi = {
  updateProfile: (body) => http.patch('/users/me', body).then(unwrap),
  changePassword: (body) => http.patch('/users/me/password', body).then(unwrap),
  addresses: () => http.get('/users/me/addresses').then(unwrap),
  addAddress: (body) => http.post('/users/me/addresses', body).then(unwrap),
  updateAddress: (id, body) => http.patch(`/users/me/addresses/${id}`, body).then(unwrap),
  deleteAddress: (id) => http.delete(`/users/me/addresses/${id}`).then(unwrap),
  wishlist: () => http.get('/users/me/wishlist').then(unwrap),
  addToWishlist: (productId) => http.post(`/users/me/wishlist/${productId}`).then(unwrap),
  removeFromWishlist: (productId) => http.delete(`/users/me/wishlist/${productId}`).then(unwrap),
};

// --- Products & reviews ---
export const productApi = {
  list: (params) => http.get('/products', { params: clean(params) }).then(unwrapList),
  categories: () => http.get('/products/categories').then(unwrap),
  get: (idOrSlug) => http.get(`/products/${idOrSlug}`).then(unwrap),
  related: (id) => http.get(`/products/${id}/related`).then(unwrap),
  reviews: (id, params) =>
    http.get(`/products/${id}/reviews`, { params: clean(params) }).then(unwrapList),
  createReview: (id, body) => http.post(`/products/${id}/reviews`, body).then(unwrap),
  updateReview: (reviewId, body) => http.patch(`/reviews/${reviewId}`, body).then(unwrap),
  deleteReview: (reviewId) => http.delete(`/reviews/${reviewId}`).then(unwrap),
  reviewSummary: (id) => http.get(`/products/${id}/review-summary`).then(unwrap),
};

// --- Cart, coupons, checkout, orders ---
export const cartApi = {
  validate: (items, couponCode) =>
    http.post('/cart/validate', clean({ items, couponCode })).then(unwrap),
  get: () => http.get('/cart').then(unwrap),
  replace: (items) => http.put('/cart', { items }).then(unwrap),
  merge: (items) => http.post('/cart/merge', { items }).then(unwrap),
  clear: () => http.delete('/cart').then(unwrap),
  validateCoupon: (code, items) => http.post('/coupons/validate', { code, items }).then(unwrap),
};

export const orderApi = {
  checkout: (body) => http.post('/checkout/session', body).then(unwrap),
  mine: (params) => http.get('/orders/me', { params: clean(params) }).then(unwrapList),
  get: (id) => http.get(`/orders/me/${id}`).then(unwrap),
  bySession: (sessionId) => http.get(`/orders/me/by-session/${sessionId}`).then(unwrap),
  cancel: (id) => http.post(`/orders/${id}/cancel`).then(unwrap),
};

// --- AI ---
export const aiApi = {
  search: (body) =>
    http.post('/ai/search', body).then((res) => ({ ...res.data.data, meta: res.data.meta })),
  recommendations: () => http.get('/ai/recommendations').then(unwrap),
  chatSession: (id) => http.get(`/ai/chat/sessions/${id}`).then(unwrap),
  deleteChatSession: (id) => http.delete(`/ai/chat/sessions/${id}`).then(unwrap),
  generateDescription: (body) => http.post('/ai/admin/generate-description', body).then(unwrap),
};

// --- Admin ---
export const adminApi = {
  stats: (params) => http.get('/admin/stats', { params: clean(params) }).then(unwrap),
  users: (params) => http.get('/admin/users', { params: clean(params) }).then(unwrapList),
  setRole: (id, role) => http.patch(`/admin/users/${id}/role`, { role }).then(unwrap),
  products: (params) => http.get('/admin/products', { params: clean(params) }).then(unwrapList),
  createProduct: (body) => http.post('/products', body).then(unwrap),
  updateProduct: (id, body) => http.patch(`/products/${id}`, body).then(unwrap),
  deleteProduct: (id) => http.delete(`/products/${id}`).then(unwrap),
  uploadImages: (id, files) => {
    const form = new FormData();
    for (const file of files) form.append('images', file);
    return (
      http
        // axios + the browser set multipart/form-data with the right boundary for FormData.
        .post(`/products/${id}/images`, form)
        .then(unwrap)
    );
  },
  deleteImage: (id, imageId) => http.delete(`/products/${id}/images/${imageId}`).then(unwrap),
  orders: (params) => http.get('/admin/orders', { params: clean(params) }).then(unwrapList),
  order: (id) => http.get(`/admin/orders/${id}`).then(unwrap),
  setOrderStatus: (id, body) => http.patch(`/admin/orders/${id}/status`, body).then(unwrap),
  coupons: (params) => http.get('/admin/coupons', { params: clean(params) }).then(unwrapList),
  createCoupon: (body) => http.post('/admin/coupons', body).then(unwrap),
  updateCoupon: (id, body) => http.patch(`/admin/coupons/${id}`, body).then(unwrap),
  deleteCoupon: (id) => http.delete(`/admin/coupons/${id}`).then(unwrap),
  supportTickets: (params) =>
    http.get('/admin/support-tickets', { params: clean(params) }).then(unwrapList),
  setTicketStatus: (id, status) =>
    http.patch(`/admin/support-tickets/${id}/status`, { status }).then(unwrap),
};
