import { ArrowLeft, LayoutDashboard, Package, ShoppingBag, Tag, Users } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuthStore } from '../../stores/authStore.js';

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/coupons', label: 'Coupons', icon: Tag },
];

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-slate-800 bg-slate-900 text-slate-300 md:min-h-screen md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 md:block">
          <Link to="/admin" className="flex items-center gap-2 font-bold text-white">
            <ShoppingBag className="size-5 text-brand-500" /> ShopWise Admin
          </Link>
          <p className="hidden truncate text-xs text-slate-500 md:mt-1 md:block">{user.email}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col" aria-label="Admin">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`
              }
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap hover:text-white md:mt-4"
          >
            <ArrowLeft className="size-4" /> Back to store
          </Link>
        </nav>
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminHeader({ title, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
