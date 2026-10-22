import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cartApi, userApi } from '../api/endpoints.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCartStore } from '../stores/cartStore.js';
import { errorMessage } from './api.js';

/** Wishlist membership lives on `user.wishlist` (product ids); toggling keeps it in sync. */
export function useWishlist() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ productId, add }) =>
      add ? userApi.addToWishlist(productId) : userApi.removeFromWishlist(productId),
    onSuccess: ({ items }, { add }) => {
      const current = useAuthStore.getState().user;
      if (current) {
        useAuthStore.setState({ user: { ...current, wishlist: items.map((p) => p._id) } });
      }
      queryClient.setQueryData(['wishlist'], { items });
      toast.success(add ? 'Saved to wishlist' : 'Removed from wishlist');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const ids = user?.wishlist ?? [];
  return {
    has: (productId) => ids.includes(productId),
    toggle: (productId) => {
      if (!user) {
        toast.info('Sign in to save items to your wishlist');
        navigate('/login', { state: { from: window.location.pathname } });
        return;
      }
      mutation.mutate({ productId, add: !ids.includes(productId) });
    },
    pending: mutation.isPending,
  };
}

export function useAddToCart() {
  const add = useCartStore((s) => s.add);
  return (product, quantity = 1) => {
    if (product.stock === 0) {
      toast.error('This item is out of stock');
      return;
    }
    add(product._id, quantity);
    toast.success(`Added ${product.name} to cart`);
  };
}

/** Prices the local cart on the server (`POST /cart/validate`); never recomputed client-side. */
export function useCartPricing() {
  const items = useCartStore((s) => s.items);
  const couponCode = useCartStore((s) => s.couponCode);
  return useQuery({
    queryKey: ['cart-pricing', items, couponCode],
    queryFn: () => cartApi.validate(items, couponCode ?? undefined),
    placeholderData: keepPreviousData,
  });
}
