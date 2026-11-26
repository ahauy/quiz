import { create } from "zustand";
import type { Role } from "@quiz/shared";
import type { AuthResult, User } from "@/lib/schemas.js";

export type AuthStatus = "idle" | "authenticated" | "anonymous";

type RefreshExecutor = () => Promise<string | null>;

export interface AuthState {
  userId: string | null;
  role: Role | null;
  accessToken: string | null;
  status: AuthStatus;
  hydrated: boolean;
  // Single-flight holder: concurrent 401s share one in-flight refresh promise.
  refreshPromise: Promise<string | null> | null;
  refreshExecutor: RefreshExecutor | null;
  setSession: (userId: string, role: Role) => void;
  clearSession: () => void;
  setAccessToken: (token: string | null) => void;
  applyAuthResult: (result: AuthResult) => void;
  applyUser: (user: User) => void;
  setHydrated: () => void;
  registerRefreshExecutor: (executor: RefreshExecutor) => void;
  refresh: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  role: null,
  accessToken: null,
  status: "idle",
  hydrated: false,
  refreshPromise: null,
  refreshExecutor: null,

  setSession: (userId, role) => set({ userId, role, status: "authenticated" }),
  clearSession: () =>
    set({ userId: null, role: null, accessToken: null, status: "anonymous" }),
  setAccessToken: (token) => set({ accessToken: token }),
  applyAuthResult: (result) =>
    set({
      accessToken: result.accessToken,
      userId: result.user.id,
      role: result.user.role,
      status: "authenticated",
      hydrated: true,
    }),
  applyUser: (user) => set({ userId: user.id, role: user.role, status: "authenticated" }),
  setHydrated: () => set({ hydrated: true }),
  registerRefreshExecutor: (executor) => set({ refreshExecutor: executor }),

  refresh: () => {
    const pending = get().refreshPromise;
    if (pending) return pending;
    const executor = get().refreshExecutor;
    if (!executor) return Promise.resolve(null);
    const promise = executor().finally(() => {
      set({ refreshPromise: null });
    });
    set({ refreshPromise: promise });
    return promise;
  },
}));
