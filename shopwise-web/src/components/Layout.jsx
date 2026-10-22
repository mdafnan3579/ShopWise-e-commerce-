import { useQueryClient } from '@tanstack/react-query';
import {
  Heart,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore.js';
import { useCartCount } from '../stores/cartStore.js';
import { ChatWidget } from './ChatWidget.jsx';

function SearchBar({ className = '' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [query, setQuery] = useState(
    location.pathname === '/search' ? (params.get('q') ?? '') : '',
  );

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={submit} className={`relative ${className}`} role="search">
      <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-500" />
      <input
        className="input pr-10 pl-9"
        placeholder="Try “waterproof running shoes under $100”"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={200}
        aria-label="Search products"
      />
      <button
        type="submit"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        aria-label="Search"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}

function AccountMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const onLogout = async () => {
    await logout();
    queryClient.clear();
    toast.success('Signed out');
    navigate('/');
  };

  const item = 'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100';
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-ghost px-2"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {user.name[0].toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate lg:inline">{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="card absolute right-0 z-40 mt-2 w-56 p-1.5 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          {user.role === 'admin' && (
            <Link to="/admin" className={item}>
              <LayoutDashboard className="size-4" /> Admin dashboard
            </Link>
          )}
          <Link to="/account/orders" className={item}>
            <Package className="size-4" /> Orders
          </Link>
          <Link to="/account/wishlist" className={item}>
            <Heart className="size-4" /> Wishlist
          </Link>
          <Link to="/account" className={item}>
            <User className="size-4" /> Account
          </Link>
          <button onClick={onLogout} className={`${item} w-full text-left text-red-600`}>
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const status = useAuthStore((s) => s.status);
  const count = useCartCount();
  const navLink = ({ isActive }) =>
    `text-sm font-medium ${isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
          <ShoppingBag className="size-6" /> ShopWise
        </Link>
        <nav className="ml-4 hidden gap-5 md:flex">
          <NavLink to="/products" className={navLink} end>
            Shop
          </NavLink>
          <Link
            to="/products?sort=-rating"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Top rated
          </Link>
        </nav>
        <SearchBar className="mx-auto hidden w-full max-w-md md:block" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link to="/cart" className="btn-ghost relative px-2" aria-label={`Cart, ${count} items`}>
            <ShoppingCart className="size-5" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
                {count}
              </span>
            )}
          </Link>
          {status === 'authenticated' ? (
            <AccountMenu />
          ) : (
            status === 'guest' && (
              <Link to="/login" className="btn-primary">
                Sign in
              </Link>
            )
          )}
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} ShopWise · A portfolio project</p>
        <p>Payments are Stripe test mode: use card 4242 4242 4242 4242.</p>
      </div>
    </footer>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
