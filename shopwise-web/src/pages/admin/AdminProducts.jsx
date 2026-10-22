import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { adminApi, productApi } from '../../api/endpoints.js';
import { Badge, ErrorState, PageLoader, Pagination } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/api.js';
import { formatPrice, primaryImage } from '../../lib/format.js';
import { AdminHeader } from './AdminLayout.jsx';

export function AdminProducts() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    status: 'all',
    lowStock: false,
    sort: '-createdAt',
    page: 1,
  });
  const [q, setQ] = useState('');
  const categories = useQuery({ queryKey: ['categories'], queryFn: productApi.categories });
  const products = useQuery({
    queryKey: ['admin-products', filters],
    queryFn: () =>
      adminApi.products({ ...filters, lowStock: filters.lowStock || undefined, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const update = (changes) => setFilters((f) => ({ ...f, page: 1, ...changes }));

  const toggleActive = useMutation({
    mutationFn: (p) =>
      p.isActive
        ? adminApi.deleteProduct(p._id)
        : adminApi.updateProduct(p._id, { isActive: true }),
    onSuccess: (_, p) => {
      toast.success(p.isActive ? `${p.name} deactivated` : `${p.name} reactivated`);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <AdminHeader title="Products">
        <Link to="/admin/products/new" className="btn-primary">
          <Plus className="size-4" /> New product
        </Link>
      </AdminHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q });
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-64 pl-9"
            placeholder="Search products"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <select
          className="input w-auto"
          value={filters.category}
          onChange={(e) => update({ category: e.target.value })}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="Status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className="input w-auto"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value })}
          aria-label="Sort"
        >
          <option value="-createdAt">Newest</option>
          <option value="name">Name</option>
          <option value="price">Price ↑</option>
          <option value="-price">Price ↓</option>
          <option value="-rating">Rating</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand-600"
            checked={filters.lowStock}
            onChange={(e) => update({ lowStock: e.target.checked })}
          />
          Low stock
        </label>
      </div>

      {products.isPending && <PageLoader />}
      {products.isError && <ErrorState error={products.error} onRetry={products.refetch} />}
      {products.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.data.items.map((p) => (
                <tr key={p._id} className={p.isActive ? '' : 'bg-slate-50 text-slate-500'}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-slate-100">
                        {primaryImage(p) && (
                          <img src={primaryImage(p)} alt="" className="size-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/admin/products/${p._id}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {p.name}
                        </Link>
                        <p className="text-xs text-slate-500">{p.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">{p.category}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPrice(p.priceCents)}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${p.stock <= 5 ? 'font-medium text-amber-700' : ''}`}
                  >
                    {p.stock}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link
                      to={`/admin/products/${p._id}`}
                      className="mr-3 text-brand-700 hover:underline"
                    >
                      Edit
                    </Link>
                    <button
                      className={
                        p.isActive
                          ? 'text-red-600 hover:underline'
                          : 'text-emerald-700 hover:underline'
                      }
                      onClick={() =>
                        (!p.isActive ||
                          window.confirm(
                            `Deactivate ${p.name}? It will be hidden from the store.`,
                          )) &&
                        toggleActive.mutate(p)
                      }
                    >
                      {p.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {products.data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        meta={products.data?.meta}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </>
  );
}
