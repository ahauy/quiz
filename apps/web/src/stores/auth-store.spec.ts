import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@quiz/shared";
import { useAuthStore } from "./auth-store.js";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it("sets and clears the session without leaking the previous role", () => {
    useAuthStore.getState().setSession("user-1", Role.TEACHER);
    expect(useAuthStore.getState().role).toBe(Role.TEACHER);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({ userId: null, role: null });
  });
});
