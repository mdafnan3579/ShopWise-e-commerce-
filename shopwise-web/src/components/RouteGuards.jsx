import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '../stores/authStore.js';
import { PageLoader } from './ui.jsx';

export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Login/register pages bounce signed-in users back to where they came from. */
export function GuestOnly() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to={location.state?.from ?? '/'} replace />;
  return <Outlet />;
}
