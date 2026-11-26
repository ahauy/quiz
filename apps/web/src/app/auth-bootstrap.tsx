import { useEffect, type ReactNode } from "react";
import { apiRequest, configureApiClient } from "@/lib/api-client.js";
import { authResultSchema, type AuthResult } from "@/lib/schemas.js";
import { useAuthStore } from "@/stores/auth-store.js";

let hydrationStarted = false;

async function executeRefresh(): Promise<string | null> {
  try {
    const result: AuthResult = await apiRequest("/auth/refresh", {
      method: "POST",
      schema: authResultSchema,
      skipRefresh: true,
    });
    useAuthStore.getState().applyAuthResult(result);
    return result.accessToken;
  } catch {
    // No valid refresh cookie (or API unreachable): settle the session as anonymous.
    useAuthStore.getState().clearSession();
    return null;
  }
}

export function bootstrapAuth(): void {
  useAuthStore.getState().registerRefreshExecutor(executeRefresh);
  configureApiClient({
    getAccessToken: () => useAuthStore.getState().accessToken,
    refresh: () => useAuthStore.getState().refresh(),
  });
}

export async function hydrateSession(): Promise<void> {
  if (hydrationStarted) return;
  hydrationStarted = true;
  await useAuthStore.getState().refresh();
  useAuthStore.getState().setHydrated();
}

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const hydrated = useAuthStore((state) => state.hydrated);
  useEffect(() => {
    void hydrateSession();
  }, []);
  if (!hydrated) {
    return <p role="status" aria-live="polite">Đang tải phiên đăng nhập…</p>;
  }
  return <>{children}</>;
}
