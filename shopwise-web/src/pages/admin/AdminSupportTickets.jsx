import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '../../api/endpoints.js';
import { Badge, EmptyState, ErrorState, PageLoader, Pagination } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/api.js';
import { formatDateTime } from '../../lib/format.js';
import { AdminHeader } from './AdminLayout.jsx';

const PRIORITY_TONES = { high: 'danger', normal: 'info', low: 'neutral' };
const CATEGORY_LABELS = {
  refund: 'Refund',
  return: 'Return',
  damaged_or_wrong_item: 'Damaged / wrong item',
  delivery_problem: 'Delivery problem',
  cancel_paid_order: 'Cancel paid order',
  account: 'Account',
  other: 'Other',
};

/** Cases the AI assistant handed to the human support team (API.md Admin › support tickets). */
export function AdminSupportTickets() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: 'open', priority: '', category: '', page: 1 });
  const [q, setQ] = useState('');
  const tickets = useQuery({
    queryKey: ['admin-support-tickets', filters],
    queryFn: () => adminApi.supportTickets({ ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const update = (changes) => setFilters((f) => ({ ...f, page: 1, ...changes }));
  const setStatus = useMutation({
    mutationFn: ({ id, status }) => adminApi.setTicketStatus(id, status),
    onSuccess: (ticket) => {
      toast.success(`${ticket.ticketNumber} marked ${ticket.status}`);
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <AdminHeader title="Support tickets" />
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
            placeholder="Ticket, order number or text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <select
          className="input w-auto"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="Status"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
        </select>
        <select
          className="input w-auto"
          value={filters.priority}
          onChange={(e) => update({ priority: e.target.value })}
          aria-label="Priority"
        >
          <option value="">Any priority</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select
          className="input w-auto"
          value={filters.category}
          onChange={(e) => update({ category: e.target.value })}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {tickets.isPending && <PageLoader />}
      {tickets.isError && <ErrorState error={tickets.error} onRetry={tickets.refetch} />}
      {tickets.data?.items.length === 0 && (
        <EmptyState icon={LifeBuoy} title="No tickets">
          Tickets appear here when the AI assistant hands a case to the support team.
        </EmptyState>
      )}
      {tickets.data?.items.length > 0 && (
        <div className="space-y-3">
          {tickets.data.items.map((t) => (
            <article key={t._id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{t.ticketNumber}</span>
                <Badge tone={PRIORITY_TONES[t.priority]}>{t.priority}</Badge>
                <Badge>{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
                {t.status === 'resolved' && <Badge tone="success">resolved</Badge>}
                <span className="ml-auto text-xs text-slate-500">
                  {formatDateTime(t.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t.user ? `${t.user.name} · ${t.user.email}` : 'Deleted user'}
                {t.orderNumber && ` · Order ${t.orderNumber}`}
              </p>
              <p className="mt-2 text-sm whitespace-pre-line">{t.summary}</p>
              <div className="mt-3 flex justify-end">
                <button
                  className="text-sm text-brand-700 hover:underline"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      id: t._id,
                      status: t.status === 'open' ? 'resolved' : 'open',
                    })
                  }
                >
                  {t.status === 'open' ? 'Mark resolved' : 'Reopen'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination
        meta={tickets.data?.meta}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </>
  );
}
