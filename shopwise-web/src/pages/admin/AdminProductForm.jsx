import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { adminApi, aiApi, productApi } from '../../api/endpoints.js';
import { AiBadge, ErrorState, Field, FormError, PageLoader } from '../../components/ui.jsx';
import { errorMessage, fieldErrors, toApiError } from '../../lib/api.js';
import { AdminHeader } from './AdminLayout.jsx';

const EMPTY = {
  name: '',
  tagline: '',
  description: '',
  price: '',
  category: '',
  brand: '',
  tags: '',
  stock: '0',
  isActive: true,
};

function toForm(p) {
  return {
    name: p.name,
    tagline: p.tagline ?? '',
    description: p.description,
    price: (p.priceCents / 100).toFixed(2),
    category: p.category,
    brand: p.brand ?? '',
    tags: (p.tags ?? []).join(', '),
    stock: String(p.stock),
    isActive: p.isActive,
  };
}

function toInput(form) {
  const body = {
    name: form.name.trim(),
    description: form.description.trim(),
    priceCents: Math.round(Number(form.price) * 100),
    category: form.category,
    stock: Number(form.stock),
    isActive: form.isActive,
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
  if (form.tagline.trim()) body.tagline = form.tagline.trim();
  if (form.brand.trim()) body.brand = form.brand.trim();
  return body;
}

/** API.md §8: the generator returns a draft that fills the form; the admin edits before saving. */
function AiAssistPanel({ form, onDraft }) {
  const [features, setFeatures] = useState('');
  const [audience, setAudience] = useState('');
  const generate = useMutation({
    mutationFn: aiApi.generateDescription,
    onSuccess: (draft) => {
      onDraft(draft);
      toast.success('Draft generated. Review it before saving.');
    },
  });
  const unavailable = toApiError(generate.error ?? {}).code === 'AI_UNAVAILABLE';
  const ready = form.name.trim().length >= 2 && form.category && features.trim();

  return (
    <div className="card border-brand-200 bg-brand-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-brand-600" />
        <h2 className="text-sm font-semibold">Write it with AI</h2>
      </div>
      {unavailable ? (
        <p className="text-sm text-slate-600">
          The AI writer is unavailable right now. You can still fill the form by hand.
        </p>
      ) : (
        <div className="space-y-3">
          <Field label="Key features" hint="Comma-separated, e.g. 40h battery, ANC, USB-C">
            <input
              className="input"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
            />
          </Field>
          <Field label="Audience (optional)">
            <input
              className="input"
              placeholder="Commuters, gamers…"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </Field>
          {generate.error && <p className="text-xs text-red-600">{errorMessage(generate.error)}</p>}
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={!ready || generate.isPending}
            onClick={() =>
              generate.mutate({
                name: form.name.trim(),
                category: form.category,
                brand: form.brand.trim() || undefined,
                audience: audience.trim() || undefined,
                features: features
                  .split(',')
                  .map((f) => f.trim())
                  .filter(Boolean)
                  .slice(0, 12),
              })
            }
          >
            <Sparkles className="size-4" />
            {generate.isPending ? 'Writing…' : 'Generate description, tagline & tags'}
          </button>
          {!ready && (
            <p className="text-xs text-slate-500">Enter a name, category and features first.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ImagesPanel({ product }) {
  const queryClient = useQueryClient();
  const onSuccess = (updated, message) => {
    queryClient.setQueryData(['admin-product', product._id], updated);
    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    toast.success(message);
  };
  const upload = useMutation({
    mutationFn: (files) => adminApi.uploadImages(product._id, files),
    onSuccess: (p) => onSuccess(p, 'Images uploaded'),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (imageId) => adminApi.deleteImage(product._id, imageId),
    onSuccess: (p) => onSuccess(p, 'Image removed'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">Images</h2>
      <div className="grid grid-cols-3 gap-2">
        {product.images.map((img, i) => (
          <div
            key={img._id}
            className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100"
          >
            <img src={img.url} alt={img.alt ?? ''} className="size-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">
                Main
              </span>
            )}
            <button
              type="button"
              onClick={() => remove.mutate(img._id)}
              className="absolute top-1 right-1 rounded bg-white/90 p-1 text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Remove image"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400">
          <ImagePlus className="size-5" />
          {upload.isPending ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="sr-only"
            disabled={upload.isPending}
            onChange={(e) => {
              const files = [...e.target.files].slice(0, 5);
              if (files.length) upload.mutate(files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Up to 5 files at a time, 5 MB each. Needs Cloudinary keys on the API.
      </p>
    </div>
  );
}

function ProductForm({ product, categories }) {
  const isNew = !product;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(product ? toForm(product) : EMPTY);
  const [aiFilled, setAiFilled] = useState(false);
  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = useMutation({
    mutationFn: (body) =>
      isNew ? adminApi.createProduct(body) : adminApi.updateProduct(product._id, body),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      if (isNew) {
        toast.success('Product created. Now add some images.');
        navigate(`/admin/products/${saved._id}`, { replace: true });
      } else {
        queryClient.setQueryData(['admin-product', product._id], saved);
        toast.success('Product saved');
      }
    },
  });
  const errors = fieldErrors(save.error);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(toInput(form));
        }}
      >
        <Field label="Name" error={errors.name}>
          <input
            className="input"
            required
            minLength={2}
            maxLength={140}
            value={form.name}
            onChange={set('name')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={errors.category}>
            <select className="input" required value={form.category} onChange={set('category')}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brand" error={errors.brand}>
            <input className="input" value={form.brand} onChange={set('brand')} />
          </Field>
          <Field label="Price ($)" error={errors.priceCents}>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.price}
              onChange={set('price')}
            />
          </Field>
          <Field label="Stock" error={errors.stock}>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              required
              value={form.stock}
              onChange={set('stock')}
            />
          </Field>
        </div>
        <Field
          label={<span className="flex items-center gap-2">Tagline {aiFilled && <AiBadge />}</span>}
          error={errors.tagline}
        >
          <input className="input" maxLength={160} value={form.tagline} onChange={set('tagline')} />
        </Field>
        <Field
          label={
            <span className="flex items-center gap-2">Description {aiFilled && <AiBadge />}</span>
          }
          error={errors.description}
          hint="20–5000 characters"
        >
          <textarea
            className="input min-h-40"
            required
            minLength={20}
            maxLength={5000}
            value={form.description}
            onChange={set('description')}
          />
        </Field>
        <Field label="Tags" error={errors.tags} hint="Comma-separated, up to 20">
          <input className="input" value={form.tags} onChange={set('tags')} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand-600"
            checked={form.isActive}
            onChange={set('isActive')}
          />
          Visible in the store
        </label>
        {Object.keys(errors).length === 0 && <FormError error={save.error} />}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending}>
            {isNew ? 'Create product' : 'Save changes'}
          </button>
          {!isNew && (
            <Link to={`/products/${product.slug}`} className="btn-ghost" target="_blank">
              View in store
            </Link>
          )}
        </div>
      </form>

      <div className="space-y-4">
        <AiAssistPanel
          form={form}
          onDraft={(draft) => {
            setForm((f) => ({
              ...f,
              description: draft.description,
              tagline: draft.tagline,
              tags: draft.tags.join(', '),
            }));
            setAiFilled(true);
          }}
        />
        {product ? (
          <ImagesPanel product={product} />
        ) : (
          <p className="card p-4 text-sm text-slate-500">
            Save the product first, then upload images.
          </p>
        )}
      </div>
    </div>
  );
}

export function AdminProductForm() {
  const { id } = useParams();
  const categories = useQuery({ queryKey: ['categories'], queryFn: productApi.categories });
  // Admins can open inactive products by id (API.md §4 Products).
  const product = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => productApi.get(id),
    enabled: !!id,
  });

  const loading = categories.isPending || (id && product.isPending);
  const error = categories.error ?? product.error;

  return (
    <>
      <Link
        to="/admin/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Products
      </Link>
      <AdminHeader title={id ? 'Edit product' : 'New product'} />
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <ProductForm
          key={id ?? 'new'}
          product={id ? product.data : null}
          categories={categories.data}
        />
      )}
    </>
  );
}
