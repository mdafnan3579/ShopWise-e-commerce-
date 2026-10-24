// A tiny client for the ShopWise backend: the agent's only way to see real orders.
//
// Security idea: the agent logs in AS the customer, so the backend itself only ever returns that
// customer's orders. Even if someone tricks the AI ("show me order SW-… of another person"), the
// backend refuses. Never rely on the prompt alone to protect data; rely on your server's checks.

const API_URL = process.env.SHOPWISE_API_URL || 'http://localhost:5000/api/v1';
// The backend only accepts POSTs from its own website origin (CSRF protection), so we send it.
const ORIGIN = process.env.SHOPWISE_ORIGIN || 'http://localhost:5173';

export class ShopWiseClient {
  constructor({ email, password }) {
    this.email = email;
    this.password = password;
    this.accessToken = null;
    this.customer = null; // { name, email } after login
  }

  /** Logs in and keeps the access token (a JWT the backend sends back as the sw_access cookie). */
  async login() {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Login failed: ${body.error?.message ?? res.status}`);

    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('sw_access='));
    this.accessToken = cookie?.split(';')[0].slice('sw_access='.length);
    if (!this.accessToken) throw new Error('Login worked but no access token came back');
    this.customer = { name: body.data.user.name, email: body.data.user.email };
    return this.customer;
  }

  /** Calls the API as the logged-in customer. Logs in again once if the 15-minute token expired. */
  async request(method, path, { retried = false } = {}) {
    if (!this.accessToken) await this.login();
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Origin: ORIGIN },
    });
    if (res.status === 401 && !retried) {
      this.accessToken = null;
      return this.request(method, path, { retried: true });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      throw new Error(body.error?.message ?? `ShopWise API error ${res.status}`);
    }
    return body;
  }

  /** The customer's orders, newest first (summary fields). */
  async listMyOrders({ status, limit = 10 } = {}) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (status) query.set('status', status);
    return (await this.request('GET', `/orders/me?${query}`)).data;
  }

  /** Customers know order NUMBERS (SW-…), the API wants ids, so we look the number up first. */
  async findOrderId(orderNumber) {
    const orders = (await this.request('GET', '/orders/me?limit=100')).data;
    const match = orders.find((o) => o.orderNumber.toUpperCase() === orderNumber.trim().toUpperCase());
    if (!match) throw new Error(`No order ${orderNumber} found on this customer's account`);
    return match._id;
  }

  async getOrder(orderNumber) {
    const id = await this.findOrderId(orderNumber);
    return (await this.request('GET', `/orders/me/${id}`)).data;
  }

  async cancelOrder(orderNumber) {
    const id = await this.findOrderId(orderNumber);
    return (await this.request('POST', `/orders/${id}/cancel`)).data;
  }
}
