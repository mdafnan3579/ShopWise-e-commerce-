import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { userApi } from '../../api/endpoints.js';
import { Field, FormError } from '../../components/ui.jsx';
import { fieldErrors } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { useAuthStore } from '../../stores/authStore.js';
import { AccountShell } from './AccountNav.jsx';

function ProfileForm({ user }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({ name: user.name, email: user.email, currentPassword: '' });
  const emailChanged = form.email.trim().toLowerCase() !== user.email;
  const mutation = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: ({ user: updated }) => {
      setUser(updated);
      setForm((f) => ({ ...f, currentPassword: '' }));
      toast.success('Profile updated');
    },
  });
  const errors = fieldErrors(mutation.error);

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name: form.name };
        if (emailChanged)
          Object.assign(body, { email: form.email, currentPassword: form.currentPassword });
        mutation.mutate(body);
      }}
    >
      <h2 className="font-semibold">Profile</h2>
      <Field label="Name" error={errors.name}>
        <input
          className="input"
          required
          minLength={2}
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Email" error={errors.email}>
        <input
          className="input"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      {emailChanged && (
        <Field
          label="Current password"
          error={errors.currentPassword}
          hint="Required to change your email."
        >
          <input
            className="input"
            type="password"
            required
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </Field>
      )}
      {Object.keys(errors).length === 0 && <FormError error={mutation.error} />}
      <button className="btn-primary" disabled={mutation.isPending}>
        Save profile
      </button>
    </form>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const mutation = useMutation({
    mutationFn: userApi.changePassword,
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Other devices have been signed out.');
    },
  });
  const errors = fieldErrors(mutation.error);

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(form);
      }}
    >
      <h2 className="font-semibold">Change password</h2>
      <Field label="Current password" error={errors.currentPassword}>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
        />
      </Field>
      <Field
        label="New password"
        error={errors.newPassword}
        hint="At least 8 characters, with a letter and a number."
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        />
      </Field>
      {Object.keys(errors).length === 0 && <FormError error={mutation.error} />}
      <button className="btn-primary" disabled={mutation.isPending}>
        Change password
      </button>
    </form>
  );
}

export function AccountPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <AccountShell title="Your account">
      <p className="mb-4 text-sm text-slate-500">Member since {formatDate(user.createdAt)}</p>
      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileForm key={user.updatedAt} user={user} />
        <PasswordForm />
      </div>
    </AccountShell>
  );
}
