import { useMutation } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Field, FormError } from '../components/ui.jsx';
import { fieldErrors } from '../lib/api.js';
import { useAuthStore } from '../stores/authStore.js';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="mb-6 text-center">
        <ShoppingBag className="mx-auto size-10 text-brand-600" />
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className="card p-6">{children}</div>
    </div>
  );
}

function useRedirectAfterAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => navigate(location.state?.from ?? '/', { replace: true });
}

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const redirect = useRedirectAfterAuth();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      redirect();
    },
  });
  const errors = fieldErrors(mutation.error);
  const fillDemo = (email, password) => setForm({ email, password });

  return (
    <AuthCard title="Sign in to ShopWise" subtitle="Your cart will be saved to your account.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(form);
        }}
      >
        <Field label="Email" error={errors.email}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        {Object.keys(errors).length === 0 && <FormError error={mutation.error} />}
        <button className="btn-primary w-full py-2.5" disabled={mutation.isPending}>
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium">Demo accounts</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className="btn-secondary py-1 text-xs"
            onClick={() => fillDemo('demo@shopwise.dev', 'Demo@12345')}
          >
            Customer
          </button>
          <button
            className="btn-secondary py-1 text-xs"
            onClick={() => fillDemo('admin@shopwise.dev', 'Admin@12345')}
          >
            Admin
          </button>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-slate-600">
        New here?{' '}
        <Link
          to="/register"
          state={location.state}
          className="font-medium text-brand-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const redirect = useRedirectAfterAuth();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const mutation = useMutation({
    mutationFn: register,
    onSuccess: () => {
      toast.success('Account created. Welcome to ShopWise!');
      redirect();
    },
  });
  const errors = fieldErrors(mutation.error);

  return (
    <AuthCard title="Create your account" subtitle="Save your cart, wishlist and orders.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(form);
        }}
      >
        <Field label="Name" error={errors.name}>
          <input
            className="input"
            autoComplete="name"
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
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field
          label="Password"
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        {Object.keys(errors).length === 0 && <FormError error={mutation.error} />}
        <button className="btn-primary w-full py-2.5" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          to="/login"
          state={location.state}
          className="font-medium text-brand-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
