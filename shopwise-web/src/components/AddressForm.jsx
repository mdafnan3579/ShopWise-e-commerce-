import { useState } from 'react';
import { fieldErrors } from '../lib/api.js';
import { Field, FormError } from './ui.jsx';

const EMPTY_ADDRESS = {
  label: '',
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  phone: '',
};

/** Drops empty optional fields: the API validates whatever is sent. */
function cleanAddress(address) {
  return Object.fromEntries(
    Object.entries(address).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );
}

export function AddressForm({
  initial,
  onSubmit,
  submitLabel = 'Save address',
  pending,
  error,
  onCancel,
  showLabel = true,
  showDefault = false,
}) {
  const [form, setForm] = useState({ ...EMPTY_ADDRESS, ...initial });
  const errors = fieldErrors(error);
  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const err = (k) => errors[k] ?? errors[`shippingAddress.${k}`];

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(cleanAddress({ ...form, country: form.country.toUpperCase() }));
      }}
    >
      {showLabel && (
        <Field label="Label (optional)" error={err('label')} className="sm:col-span-2">
          <input
            className="input"
            placeholder="Home, Work…"
            value={form.label}
            onChange={set('label')}
          />
        </Field>
      )}
      <Field label="Full name" error={err('fullName')} className="sm:col-span-2">
        <input
          className="input"
          required
          value={form.fullName}
          onChange={set('fullName')}
          autoComplete="name"
        />
      </Field>
      <Field label="Address line 1" error={err('line1')} className="sm:col-span-2">
        <input
          className="input"
          required
          value={form.line1}
          onChange={set('line1')}
          autoComplete="address-line1"
        />
      </Field>
      <Field label="Address line 2 (optional)" error={err('line2')} className="sm:col-span-2">
        <input
          className="input"
          value={form.line2}
          onChange={set('line2')}
          autoComplete="address-line2"
        />
      </Field>
      <Field label="City" error={err('city')}>
        <input
          className="input"
          required
          value={form.city}
          onChange={set('city')}
          autoComplete="address-level2"
        />
      </Field>
      <Field label="State / region" error={err('state')}>
        <input
          className="input"
          value={form.state}
          onChange={set('state')}
          autoComplete="address-level1"
        />
      </Field>
      <Field label="Postal code" error={err('postalCode')}>
        <input
          className="input"
          required
          value={form.postalCode}
          onChange={set('postalCode')}
          autoComplete="postal-code"
        />
      </Field>
      <Field label="Country (2-letter code)" error={err('country')}>
        <input
          className="input uppercase"
          required
          maxLength={2}
          value={form.country}
          onChange={set('country')}
          autoComplete="country"
        />
      </Field>
      <Field label="Phone (optional)" error={err('phone')} className="sm:col-span-2">
        <input
          className="input"
          type="tel"
          value={form.phone}
          onChange={set('phone')}
          autoComplete="tel"
        />
      </Field>
      {showDefault && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="accent-brand-600"
            checked={!!form.isDefault}
            onChange={set('isDefault')}
          />
          Make this my default address
        </label>
      )}
      {Object.keys(errors).length === 0 && (
        <div className="sm:col-span-2">
          <FormError error={error} />
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
