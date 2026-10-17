import { useEffect, useRef } from 'react';
import { cartApi } from '../api/endpoints.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCartStore } from '../stores/cartStore.js';

const PUSH_DEBOUNCE_MS = 600;

/**
 * Keeps the local cart and the server cart in step (API.md §8):
 * on login merge the guest cart in, then debounce `PUT /cart` after every change.
 */
export function CartSync() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?._id);
  const syncedFor = useRef(null);

  // Initial sync when a user session starts (login, register or restore).
  useEffect(() => {
    if (status === 'guest') {
      syncedFor.current = null;
      // The local cart belonged to a user who is no longer signed in.
      if (useCartStore.getState().ownerId) useCartStore.getState().reset();
      return;
    }
    if (status !== 'authenticated' || !userId || syncedFor.current === userId) return;

    const { items, ownerId, replaceFromPricing } = useCartStore.getState();
    const request = ownerId === userId ? cartApi.replace(items) : cartApi.merge(items);
    request
      .then((pricing) => {
        replaceFromPricing(pricing, userId);
        syncedFor.current = userId;
      })
      .catch(() => {
        // Leave the local cart untouched; the next change retries via PUT.
        syncedFor.current = userId;
      });
  }, [status, userId]);

  // Push later changes to the server while logged in.
  useEffect(() => {
    let timer;
    const unsubscribe = useCartStore.subscribe((state, prev) => {
      if (state.items === prev.items) return;
      if (!syncedFor.current || state.ownerId !== syncedFor.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        cartApi.replace(useCartStore.getState().items).catch(() => {});
      }, PUSH_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return null;
}
