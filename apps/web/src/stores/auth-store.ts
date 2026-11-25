import { create } from "zustand";
import type { Role } from "@quiz/shared";

interface AuthState {
  userId: string | null;
  role: Role | null;
  setSession: (userId: string, role: Role) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  role: null,
  setSession: (userId, role) => set({ userId, role }),
  clearSession: () => set({ userId: null, role: null }),
}));
