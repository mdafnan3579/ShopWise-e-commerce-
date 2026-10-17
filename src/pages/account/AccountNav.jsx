import { NavLink } from 'react-router';

const LINKS = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/wishlist', label: 'Wishlist' },
];

export function AccountShell({ title, children, actions }) {
  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Account">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
