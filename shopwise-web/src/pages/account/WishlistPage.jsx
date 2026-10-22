import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Link } from 'react-router';
import { userApi } from '../../api/endpoints.js';
import { ProductGrid, ProductGridSkeleton } from '../../components/ProductCard.jsx';
import { EmptyState, ErrorState } from '../../components/ui.jsx';
import { AccountShell } from './AccountNav.jsx';

export function WishlistPage() {
  const wishlist = useQuery({ queryKey: ['wishlist'], queryFn: userApi.wishlist });

  return (
    <AccountShell title="Wishlist">
      {wishlist.isPending && <ProductGridSkeleton count={4} />}
      {wishlist.isError && <ErrorState error={wishlist.error} onRetry={wishlist.refetch} />}
      {wishlist.data?.items.length === 0 && (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          action={
            <Link to="/products" className="btn-primary">
              Discover products
            </Link>
          }
        >
          Tap the heart on any product to save it for later.
        </EmptyState>
      )}
      {wishlist.data?.items.length > 0 && <ProductGrid products={wishlist.data.items} />}
    </AccountShell>
  );
}
