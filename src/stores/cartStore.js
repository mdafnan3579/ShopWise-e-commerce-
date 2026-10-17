import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const MAX_QUANTITY = 10;
export const MAX_LINES = 50;

const clamp = (n) => Math.max(1, Math.min(MAX_QUANTITY, Math.trunc(n)));

/**
 * The cart is `{ productId, quantity }` only; prices always come from the server (API.md §4).
 * `ownerId` records which user the local cart was last synced with, so a page reload while
 * logged in replaces the server cart instead of merging it into itself (quantities would add up).
 */
export const useCartStore = create(
  persist(
    (set) => ({
      items: [],
      ownerId: null,
      couponCode: null,

      setCoupon: (couponCode) => set({ couponCode: couponCode || null }),

      add: (productId, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === productId ? { ...i, quantity: clamp(i.quantity + quantity) } : i,
              ),
            };
          }
          if (state.items.length >= MAX_LINES) return state;
          return { items: [...state.items, { productId, quantity: clamp(quantity) }] };
        }),

      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity: clamp(quantity) } : i,
          ),
        })),

      remove: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      clear: () => set({ items: [], couponCode: null }),

      /** Replaces local items with a server `CartPricing` response. */
      replaceFromPricing: (pricing, ownerId) =>
        set({
          items: pricing.items.map(({ productId, quantity }) => ({ productId, quantity })),
          ownerId,
        }),

      reset: () => set({ items: [], ownerId: null, couponCode: null }),
    }),
    { name: 'shopwise-cart', storage: createJSONStorage(() => localStorage) },
  ),
);

export const useCartCount = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));
