import { Route, Routes } from 'react-router';
import { NotFoundPage } from '../NotFoundPage.jsx';
import { AdminCoupons } from './AdminCoupons.jsx';
import { AdminDashboard } from './AdminDashboard.jsx';
import { AdminLayout } from './AdminLayout.jsx';
import { AdminOrderDetail } from './AdminOrderDetail.jsx';
import { AdminOrders } from './AdminOrders.jsx';
import { AdminProductForm } from './AdminProductForm.jsx';
import { AdminProducts } from './AdminProducts.jsx';
import { AdminUsers } from './AdminUsers.jsx';

/** Loaded lazily from App so shoppers never download the admin bundle (charts included). */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="products/new" element={<AdminProductForm />} />
        <Route path="products/:id" element={<AdminProductForm />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="orders/:id" element={<AdminOrderDetail />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
