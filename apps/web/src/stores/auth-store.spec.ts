import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@quiz/shared";
import { useAuthStore } from "./auth-store.js";

const authResult = {
  accessToken: "tok-123",
  user: { id: "user-1", email: "a@b.com", displayName: "Alice", role: Role.TEACHER },
};

beforeEach(() => {
  useAuthStore.setState({
    userId: null,
    role: null,
    accessToken: null,
    status: "idle",
    hydrated: false,
    refreshPromise: null,
    refreshExecutor: null,
  });
});

describe("authStore", () => {
  it("sets and clears the session without leaking the previous role", () => {
    useAuthStore.getState().setSession("user-1", Role.TEACHER);
    expect(useAuthStore.getState().role).toBe(Role.TEACHER);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({ userId: null, role: null });
  });

  it("starts unauthenticated and not hydrated", () => {
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.hydrated).toBe(false);
  });

  it("applies an auth result to the session", () => {
    useAuthStore.getState().applyAuthResult(authResult);
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("tok-123");
    expect(state.userId).toBe("user-1");
    expect(state.role).toBe(Role.TEACHER);
    expect(state.status).toBe("authenticated");
    expect(state.hydrated).toBe(true);
  });

  it("clears the token and marks the session anonymous", () => {
    useAuthStore.getState().applyAuthResult(authResult);
    useAuthStore.getState().clearSession();
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.role).toBeNull();
    expect(state.status).toBe("anonymous");
  });

  it("sets the access token and hydrated flag independently", () => {
    useAuthStore.getState().setAccessToken("abc");
    useAuthStore.getState().setHydrated();
    expect(useAuthStore.getState().accessToken).toBe("abc");
    expect(useAuthStore.getState().hydrated).toBe(true);
  });

  it("shares a single in-flight refresh across concurrent callers", async () => {
    let resolve!: (token: string | null) => void;
    const executor = vi.fn(
      () =>
        new Promise<string | null>((res) => {
          resolve = res;
        }),
    );
    useAuthStore.getState().registerRefreshExecutor(executor);
    const first = useAuthStore.getState().refresh();
    const second = useAuthStore.getState().refresh();
    expect(executor).toHaveBeenCalledTimes(1);
    resolve("fresh-token");
    await expect(first).resolves.toBe("fresh-token");
    await expect(second).resolves.toBe("fresh-token");
    expect(useAuthStore.getState().refreshPromise).toBeNull();
  });

  it("returns null when no refresh executor is registered", async () => {
    await expect(useAuthStore.getState().refresh()).resolves.toBeNull();
  });
});
