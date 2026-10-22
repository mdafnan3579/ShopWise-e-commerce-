import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '../../api/endpoints.js';
import { Badge, ErrorState, PageLoader, Pagination } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { useAuthStore } from '../../stores/authStore.js';
import { AdminHeader } from './AdminLayout.jsx';

export function AdminUsers() {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ q: '', role: '', sort: '-createdAt', page: 1 });
  const [q, setQ] = useState('');
  const users = useQuery({
    queryKey: ['admin-users', filters],
    queryFn: () => adminApi.users({ ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const update = (changes) => setFilters((f) => ({ ...f, page: 1, ...changes }));
  const setRole = useMutation({
    mutationFn: ({ id, role }) => adminApi.setRole(id, role),
    onSuccess: ({ user }) => {
      toast.success(`${user.name} is now ${user.role === 'admin' ? 'an admin' : 'a customer'}`);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <AdminHeader title="Users" />
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
            placeholder="Name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <select
          className="input w-auto"
          value={filters.role}
          onChange={(e) => update({ role: e.target.value })}
          aria-label="Role"
        >
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="admin">Admins</option>
        </select>
        <select
          className="input w-auto"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value })}
          aria-label="Sort"
        >
          <option value="-createdAt">Newest</option>
          <option value="createdAt">Oldest</option>
          <option value="name">Name A–Z</option>
          <option value="email">Email</option>
        </select>
      </div>

      {users.isPending && <PageLoader />}
      {users.isError && <ErrorState error={users.error} onRetry={users.refetch} />}
      {users.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data.items.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {u._id !== me._id && (
                      <button
                        className="text-brand-700 hover:underline"
                        disabled={setRole.isPending}
                        onClick={() => {
                          const role = u.role === 'admin' ? 'customer' : 'admin';
                          if (
                            window.confirm(
                              `Make ${u.name} ${role === 'admin' ? 'an admin' : 'a customer'}?`,
                            )
                          )
                            setRole.mutate({ id: u._id, role });
                        }}
                      >
                        {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        meta={users.data?.meta}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </>
  );
}
