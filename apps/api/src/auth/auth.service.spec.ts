import "reflect-metadata";
import { Role } from "@quiz/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";
import { OAuthService } from "./services/oauth.service.js";
import { PasswordService } from "./services/password.service.js";
import { ResetService } from "./services/reset.service.js";
import { TokenService } from "./services/token.service.js";
import {
  FakeClock,
  FakeOAuthHttpClient,
  InMemoryAuthRepository,
  testAuthConfig,
} from "./testing/fakes.js";

const EMAIL = "student@example.com";

function registration(overrides: Record<string, unknown> = {}) {
  return {
    email: EMAIL,
    password: "password123",
    displayName: "Student",
    ...overrides,
  };
}

function tokenFromResetUrl(url: string | undefined): string {
  return new URL(url ?? "").searchParams.get("token") ?? "";
}

describe("AuthService", () => {
  let repo: InMemoryAuthRepository;
  let clock: FakeClock;
  let http: FakeOAuthHttpClient;
  let tokens: TokenService;
  let service: AuthService;

  beforeEach(() => {
    const config = testAuthConfig();
    repo = new InMemoryAuthRepository();
    clock = new FakeClock();
    http = new FakeOAuthHttpClient();
    tokens = new TokenService(config, clock);
    const passwords = new PasswordService();
    const oauth = new OAuthService(config, http);
    const reset = new ResetService(config, clock);
    service = new AuthService(repo, passwords, tokens, oauth, reset, config, clock);
  });

  // TC-001
  it("registers a STUDENT and logs in with the same credentials", async () => {
    const user = await service.register(registration());
    expect(user.role).toBe(Role.STUDENT);
    expect(user.email).toBe(EMAIL);
    expect(Object.keys(user)).not.toContain("passwordHash");
    expect(Object.keys(user)).not.toContain("tokenVersion");

    const session = await service.login({ email: EMAIL, password: "password123" });
    expect(session.result.user.role).toBe(Role.STUDENT);
    expect(tokens.verifyAccessToken(session.result.accessToken).sub).toBe(user.id);
    expect(session.refreshToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a duplicate email with EMAIL_IN_USE (409)", async () => {
    await service.register(registration());
    await expect(service.register(registration())).rejects.toMatchObject({
      code: "EMAIL_IN_USE",
    });
  });

  it("maps a concurrent unique-email violation to EMAIL_IN_USE (409)", async () => {
    const create = vi.spyOn(repo, "createUser").mockRejectedValueOnce({ code: "P2002" });
    await expect(service.register(registration())).rejects.toMatchObject({
      code: "EMAIL_IN_USE",
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects bad credentials with INVALID_CREDENTIALS", async () => {
    await expect(service.login({ email: EMAIL, password: "whatever1" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await service.register(registration());
    await expect(service.login({ email: EMAIL, password: "wrongpass" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  // TC-004
  it("grants TEACHER for a valid teacherCode and rejects a wrong one", async () => {
    const teacher = await service.register(
      registration({ email: "teacher@example.com", requestedRole: Role.TEACHER, teacherCode: "TEACH-2026" }),
    );
    expect(teacher.role).toBe(Role.TEACHER);
    await expect(
      service.register(
        registration({ email: "bad@example.com", requestedRole: Role.TEACHER, teacherCode: "wrong" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TEACHER_CODE" });
  });

  // TC-003
  it("issues a single-use reset URL; old password dies and reuse is rejected", async () => {
    await service.register(registration({ password: "oldpassword" }));
    const result = await service.forgotPassword({ email: EMAIL });
    expect(result.resetUrl).toBeDefined();
    const raw = tokenFromResetUrl(result.resetUrl);

    await service.resetPassword({ token: raw, newPassword: "newpassword" });
    await expect(service.login({ email: EMAIL, password: "oldpassword" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    const session = await service.login({ email: EMAIL, password: "newpassword" });
    expect(session.result.accessToken).toBeTruthy();

    await expect(
      service.resetPassword({ token: raw, newPassword: "anotherpass" }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
  });

  it("rejects an expired reset token with EXPIRED_RESET_TOKEN", async () => {
    await service.register(registration());
    const result = await service.forgotPassword({ email: EMAIL });
    const raw = tokenFromResetUrl(result.resetUrl);
    clock.advance(16 * 60 * 1000);
    await expect(
      service.resetPassword({ token: raw, newPassword: "newpassword" }),
    ).rejects.toMatchObject({ code: "EXPIRED_RESET_TOKEN" });
  });

  it("returns a generic message and no URL for an unknown email", async () => {
    const result = await service.forgotPassword({ email: "nobody@example.com" });
    expect(result.message).toBeTruthy();
    expect(result.resetUrl).toBeUndefined();
  });

  // TC-005
  it("updates displayName without changing credentials", async () => {
    const user = await service.register(registration());
    const { user: updated, passwordChanged } = await service.updateMe(user.id, {
      displayName: "New Name",
    });
    expect(updated.displayName).toBe("New Name");
    expect(passwordChanged).toBe(false);
  });

  it("changes the password only with the correct currentPassword", async () => {
    const user = await service.register(registration({ password: "oldpassword" }));
    await expect(
      service.updateMe(user.id, { newPassword: "newpassword", currentPassword: "wrongpass" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const { passwordChanged } = await service.updateMe(user.id, {
      newPassword: "newpassword",
      currentPassword: "oldpassword",
    });
    expect(passwordChanged).toBe(true);
    await expect(service.login({ email: EMAIL, password: "oldpassword" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect((await service.login({ email: EMAIL, password: "newpassword" })).result.user.id).toBe(
      user.id,
    );
  });

  it("invalidates prior sessions after a password change (ASM-AUTH-003)", async () => {
    const user = await service.register(registration({ password: "oldpassword" }));
    const session = await service.login({ email: EMAIL, password: "oldpassword" });
    const before = await repo.findUserById(user.id);
    await service.updateMe(user.id, { newPassword: "newpassword", currentPassword: "oldpassword" });
    const after = await repo.findUserById(user.id);
    expect(after?.tokenVersion).toBe((before?.tokenVersion ?? 0) + 1);
    await expect(service.refresh(session.refreshToken)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  // TC-006
  it("logout bumps tokenVersion and revokes the refresh token", async () => {
    const user = await service.register(registration());
    const session = await service.login({ email: EMAIL, password: "password123" });
    const before = await repo.findUserById(user.id);
    await service.logout(user.id);
    const after = await repo.findUserById(user.id);
    expect(after?.tokenVersion).toBe((before?.tokenVersion ?? 0) + 1);
    await expect(service.refresh(session.refreshToken)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rotates the refresh token so the old one cannot be reused", async () => {
    await service.register(registration());
    const first = await service.login({ email: EMAIL, password: "password123" });
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.result.user.email).toBe(EMAIL);
    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects refresh with no cookie", async () => {
    await expect(service.refresh(undefined)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  // OAuth / ASM-AUTH-001
  it("builds an authorize URL with a state that the callback checks", () => {
    const { url, state } = service.googleAuthUrl();
    expect(new URL(url).searchParams.get("state")).toBe(state);
    expect(state).toMatch(/^[0-9a-f]+$/);
  });

  it("rejects a mismatched OAuth state with INVALID_STATE", async () => {
    const { state } = service.googleAuthUrl();
    await expect(
      service.googleCallback({ code: "code", state }, "a-different-state"),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("creates a new STUDENT from a verified Google profile and issues tokens", async () => {
    const { state } = service.googleAuthUrl();
    const session = await service.googleCallback({ code: "code", state }, state);
    expect(session.result.user.role).toBe(Role.STUDENT);
    expect(session.result.user.email).toBe("teacher@example.com");
    await expect(
      service.login({ email: "teacher@example.com", password: "anything12" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("grants TEACHER to a new OAuth user with a valid teacherCode", async () => {
    http.tokenInfoResponse = {
      sub: "new-sub",
      email: "newteacher@example.com",
      email_verified: true,
      aud: "client-id",
      name: "New Teacher",
    };
    const { state } = service.googleAuthUrl();
    const session = await service.googleCallback(
      { code: "code", state, teacherCode: "TEACH-2026" },
      state,
    );
    expect(session.result.user.role).toBe(Role.TEACHER);
  });

  it("never upgrades an existing user's role via OAuth (ASM-AUTH-001)", async () => {
    const existing = await service.register(
      registration({ email: "teacher@example.com" }),
    );
    const { state } = service.googleAuthUrl();
    const session = await service.googleCallback(
      { code: "code", state, teacherCode: "TEACH-2026" },
      state,
    );
    expect(session.result.user.id).toBe(existing.id);
    expect(session.result.user.role).toBe(Role.STUDENT);
  });

  it("rejects an unverified Google email with OAUTH_FAILED", async () => {
    http.tokenInfoResponse = {
      sub: "s",
      email: "u@example.com",
      email_verified: "false",
      aud: "client-id",
    };
    const { state } = service.googleAuthUrl();
    await expect(service.googleCallback({ code: "code", state }, state)).rejects.toMatchObject({
      code: "OAUTH_FAILED",
    });
  });
});
