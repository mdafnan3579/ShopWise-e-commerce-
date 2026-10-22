import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { userApi } from '../../api/endpoints.js';
import { AddressForm } from '../../components/AddressForm.jsx';
import { Badge, EmptyState, ErrorState, PageLoader } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/api.js';
import { AccountShell } from './AccountNav.jsx';

export function AddressesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | address
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: userApi.addresses });

  const onSaved = (data, message) => {
    queryClient.setQueryData(['addresses'], data);
    setEditing(null);
    toast.success(message);
  };
  const save = useMutation({
    mutationFn: (body) =>
      editing === 'new' ? userApi.addAddress(body) : userApi.updateAddress(editing._id, body),
    onSuccess: (data) => onSaved(data, 'Address saved'),
  });
  const remove = useMutation({
    mutationFn: userApi.deleteAddress,
    onSuccess: (data) => onSaved(data, 'Address removed'),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const makeDefault = useMutation({
    mutationFn: (id) => userApi.updateAddress(id, { isDefault: true }),
    onSuccess: (data) => onSaved(data, 'Default address updated'),
  });

  const list = addresses.data?.addresses ?? [];
  return (
    <AccountShell
      title="Addresses"
      actions={
        !editing &&
        list.length < 10 && (
          <button
            className="btn-primary"
            onClick={() => {
              save.reset();
              setEditing('new');
            }}
          >
            <Plus className="size-4" /> Add address
          </button>
        )
      }
    >
      {addresses.isPending && <PageLoader />}
      {addresses.isError && <ErrorState error={addresses.error} onRetry={addresses.refetch} />}

      {editing && (
        <div className="card mb-6 p-5">
          <h2 className="mb-4 font-semibold">
            {editing === 'new' ? 'New address' : 'Edit address'}
          </h2>
          <AddressForm
            key={editing === 'new' ? 'new' : editing._id}
            initial={editing === 'new' ? {} : editing}
            showDefault={editing === 'new' || !editing.isDefault}
            onSubmit={(body) => {
              const { _id, ...rest } = body;
              save.mutate(rest);
            }}
            pending={save.isPending}
            error={save.error}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {addresses.data && list.length === 0 && !editing && (
        <EmptyState icon={MapPin} title="No saved addresses">
          Add one now, or save it during checkout.
        </EmptyState>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((a) => (
          <div key={a._id} className="card p-4 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-semibold">{a.label || a.fullName}</span>
              {a.isDefault && <Badge tone="brand">Default</Badge>}
            </div>
            {a.label && <p>{a.fullName}</p>}
            <p className="text-slate-600">
              {a.line1}
              {a.line2 && `, ${a.line2}`}
              <br />
              {a.city}
              {a.state && `, ${a.state}`} {a.postalCode}
              <br />
              {a.country}
              {a.phone && ` · ${a.phone}`}
            </p>
            <div className="mt-3 flex gap-3 text-xs font-medium">
              <button
                className="text-brand-700 hover:underline"
                onClick={() => {
                  save.reset();
                  setEditing(a);
                }}
              >
                Edit
              </button>
              {!a.isDefault && (
                <button
                  className="text-brand-700 hover:underline"
                  onClick={() => makeDefault.mutate(a._id)}
                >
                  Make default
                </button>
              )}
              <button
                className="text-red-600 hover:underline"
                onClick={() => window.confirm('Remove this address?') && remove.mutate(a._id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </AccountShell>
  );
}
