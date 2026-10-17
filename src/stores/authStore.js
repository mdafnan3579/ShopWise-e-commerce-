import { create } from 'zustand';
import { authApi } from '../api/endpoints.js';
import { configureAuthHooks, refreshSession } from '../lib/api.js';

/** status: 'loading' until the session restore finishes, then 'authenticated' or 'guest'. */
export const useAuthStore = create((set) => ({
  user: null,
  status: 'loading',

  setUser: (user) => set({ user, status: user ? 'authenticated' : 'guest' }),

  /** API.md §2: `GET /auth/me`; on 401 try `POST /auth/refresh` once; otherwise guest. */
  restore: async () => {
    try {
      const { user } = await authApi.me();
      set({ user, status: 'authenticated' });
    } catch {
      try {
        const user = await refreshSession();
        set({ user, status: 'authenticated' });
      } catch {
        set({ user: null, status: 'guest' });
      }
    }
  },

  login: async (credentials) => {
    const { user } = await authApi.login(credentials);
    set({ user, status: 'authenticated' });
    return user;
  },

  register: async (body) => {
    const { user } = await authApi.register(body);
    set({ user, status: 'authenticated' });
    return user;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, status: 'guest' });
    }
  },
}));

configureAuthHooks({
  isLoggedIn: () => useAuthStore.getState().status === 'authenticated',
  onSessionEnded: () => useAuthStore.setState({ user: null, status: 'guest' }),
});

export const useUser = () => useAuthStore((s) => s.user);
export const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'admin');
