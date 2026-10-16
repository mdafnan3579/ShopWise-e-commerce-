import { LOW_STOCK_THRESHOLD } from '../config/catalog.js';
import { ORDER_STATUSES } from '../config/commerce.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_PRODUCTS = 5;
const LOW_STOCK_LIMIT = 10;

/** Revenue counts only money we kept: paid orders (refunded ones have paymentStatus 'refunded'). */
const PAID = { paymentStatus: 'paid' };

/** UTC bucket start for a date, matching MongoDB's `$dateTrunc` (weeks start on Monday). */
export function bucketStart(date, granularity) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === 'week') {
    const daysSinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  } else if (granularity === 'month') {
    d.setUTCDate(1);
  }
  return d;
}

function nextBucket(date, granularity) {
  const d = new Date(date);
  if (granularity === 'day') d.setUTCDate(d.getUTCDate() + 1);
  else if (granularity === 'week') d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Every bucket in the range, so charts get explicit zeros instead of gaps. */
export function listBuckets(from, to, granularity) {
  const buckets = [];
  for (let b = bucketStart(from, granularity); b <= to; b = nextBucket(b, granularity)) {
    buckets.push(b.toISOString());
  }
  return buckets;
}

function percentChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null; // null = "new" (no baseline)
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function salesTotals(from, to) {
  const [row] = await Order.aggregate([
    { $match: { ...PAID, paidAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        revenueCents: { $sum: '$totalCents' },
        orders: { $sum: 1 },
        unitsSold: { $sum: { $sum: '$items.quantity' } },
      },
    },
  ]);
  return {
    revenueCents: row?.revenueCents ?? 0,
    orders: row?.orders ?? 0,
    unitsSold: row?.unitsSold ?? 0,
  };
}

function countNewCustomers(from, to) {
  return User.countDocuments({ role: 'customer', createdAt: { $gte: from, $lte: to } });
}

async function revenueSeries(from, to, granularity) {
  const [sales, signups] = await Promise.all([
    Order.aggregate([
      { $match: { ...PAID, paidAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$paidAt',
              unit: granularity,
              timezone: 'UTC',
              startOfWeek: 'monday',
            },
          },
          revenueCents: { $sum: '$totalCents' },
          orders: { $sum: 1 },
        },
      },
    ]),
    User.aggregate([
      { $match: { role: 'customer', createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$createdAt',
              unit: granularity,
              timezone: 'UTC',
              startOfWeek: 'monday',
            },
          },
          newCustomers: { $sum: 1 },
        },
      },
    ]),
  ]);

  const salesByBucket = new Map(sales.map((row) => [row._id.toISOString(), row]));
  const signupsByBucket = new Map(signups.map((row) => [row._id.toISOString(), row.newCustomers]));

  return listBuckets(from, to, granularity).map((period) => ({
    period,
    revenueCents: salesByBucket.get(period)?.revenueCents ?? 0,
    orders: salesByBucket.get(period)?.orders ?? 0,
    newCustomers: signupsByBucket.get(period) ?? 0,
  }));
}

function topProducts(from, to) {
  return Order.aggregate([
    { $match: { ...PAID, paidAt: { $gte: from, $lte: to } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $last: '$items.name' },
        unitsSold: { $sum: '$items.quantity' },
        revenueCents: { $sum: '$items.lineTotalCents' },
      },
    },
    { $sort: { revenueCents: -1, unitsSold: -1 } },
    { $limit: TOP_PRODUCTS },
    { $project: { _id: 0, productId: '$_id', name: 1, unitsSold: 1, revenueCents: 1 } },
  ]);
}

async function ordersByStatus(from, to) {
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

function lowStockProducts() {
  return Product.find({ isActive: true, stock: { $lte: LOW_STOCK_THRESHOLD } })
    .select('name slug stock category images')
    .sort({ stock: 1, name: 1 })
    .limit(LOW_STOCK_LIMIT)
    .lean();
}

/**
 * Dashboard stats for a date range, plus the same-length previous period for the
 * "+12% vs previous period" deltas on the stat cards. All queries run in parallel and are
 * served by indexes on paidAt / createdAt / stock.
 *
 * @param {{ from?: Date, to?: Date, granularity: 'day' | 'week' | 'month' }} params
 */
export async function getDashboardStats({ from, to, granularity }) {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 30 * DAY_MS);
  const span = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - span);
  const previousEnd = new Date(start.getTime() - 1);

  const [
    current,
    previous,
    newCustomers,
    previousNewCustomers,
    series,
    top,
    statuses,
    lowStock,
    needsAttention,
  ] = await Promise.all([
    salesTotals(start, end),
    salesTotals(previousStart, previousEnd),
    countNewCustomers(start, end),
    countNewCustomers(previousStart, previousEnd),
    revenueSeries(start, end, granularity),
    topProducts(start, end),
    ordersByStatus(start, end),
    lowStockProducts(),
    Order.countDocuments({ needsAttention: { $exists: true } }),
  ]);

  const averageOrderValueCents = current.orders
    ? Math.round(current.revenueCents / current.orders)
    : 0;
  const previousAov = previous.orders ? Math.round(previous.revenueCents / previous.orders) : 0;

  return {
    range: { from: start, to: end, granularity },
    totals: {
      revenueCents: current.revenueCents,
      orders: current.orders,
      unitsSold: current.unitsSold,
      averageOrderValueCents,
      newCustomers,
    },
    changeVsPreviousPeriod: {
      revenuePercent: percentChange(current.revenueCents, previous.revenueCents),
      ordersPercent: percentChange(current.orders, previous.orders),
      averageOrderValuePercent: percentChange(averageOrderValueCents, previousAov),
      newCustomersPercent: percentChange(newCustomers, previousNewCustomers),
    },
    revenueOverTime: series,
    ordersByStatus: statuses,
    topProducts: top,
    lowStock: { threshold: LOW_STOCK_THRESHOLD, products: lowStock },
    ordersNeedingAttention: needsAttention,
  };
}
