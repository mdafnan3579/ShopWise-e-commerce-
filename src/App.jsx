import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router';
import { AccountPage } from './pages/account/AccountPage.jsx';
import { AddressesPage } from './pages/account/AddressesPage.jsx';
import { OrderDetailPage } from './pages/account/OrderDetailPage.jsx';
import { OrdersPage } from './pages/account/OrdersPage.jsx';
import { WishlistPage } from './pages/account/WishlistPage.jsx';
import { CartPage } from './pages/CartPage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ProductDetailPage } from './pages/ProductDetailPage.jsx';
import { ProductsPage } from './pages/ProductsPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { CartSync } from './components/CartSync.jsx';
import { Layout } from './components/Layout.jsx';
import { GuestOnly, RequireAdmin, RequireAuth } from './components/RouteGuards.jsx';
import { PageLoader } from './components/ui.jsx';
import { useAuthStore } from './stores/authStore.js';

const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes.jsx'));

export function App() {
  const restore = useAuthStore((s) => s.restore);
  useEffect(() => {
    restore();
  }, [restore]);

  return (
    <>
      <CartSync />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:slug" element={<ProductDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="cart" element={<CartPage />} />

          <Route element={<GuestOnly />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="checkout/success" element={<CheckoutSuccessPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="account/addresses" element={<AddressesPage />} />
            <Route path="account/orders" element={<OrdersPage />} />
            <Route path="account/orders/:id" element={<OrderDetailPage />} />
            <Route path="account/wishlist" element={<WishlistPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="admin/*" element={<RequireAdmin />}>
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader />}>
                <AdminRoutes />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
