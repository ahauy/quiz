import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@quiz/shared";
import { describe, expect, it } from "vitest";
import { TokenService } from "../services/token.service.js";
import { FakeClock, InMemoryAuthRepository, testAuthConfig } from "../testing/fakes.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

interface Req {
  headers: { authorization?: string };
  user?: unknown;
}

function context(
  authorization: string | undefined,
  metadata?: Record<string, unknown>,
): { ctx: ExecutionContext; req: Req } {
  const handler = () => undefined;
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      Reflect.defineMetadata(key, value, handler);
    }
  }
  const req: Req = { headers: {} };
  if (authorization !== undefined) req.headers.authorization = authorization;
  const ctx = {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function setup() {
  const config = testAuthConfig();
  const clock = new FakeClock();
  const tokens = new TokenService(config, clock);
  const repo = new InMemoryAuthRepository();
  const guard = new JwtAuthGuard(new Reflector(), tokens, repo);
  return { config, clock, tokens, repo, guard };
}

async function student(setupValue: ReturnType<typeof setup>) {
  return setupValue.repo.createUser({
    email: "student@example.com",
    displayName: "Student",
    passwordHash: null,
    role: Role.STUDENT,
  });
}

describe("JwtAuthGuard", () => {
  it("lets @Public routes through with no token", async () => {
    const { guard } = setup();
    const { ctx } = context(undefined, { [IS_PUBLIC_KEY]: true });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it("rejects a missing or malformed Authorization header", async () => {
    const { guard } = setup();
    await expect(guard.canActivate(context(undefined).ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(guard.canActivate(context("token-without-bearer").ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(guard.canActivate(context("Bearer garbage").ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects an expired access token", async () => {
    const s = setup();
    const user = await student(s);
    const token = s.tokens.signAccessToken({
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    s.clock.advance(901 * 1000);
    await expect(s.guard.canActivate(context(`Bearer ${token}`).ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const s = setup();
    const user = await student(s);
    const impostor = new TokenService(
      testAuthConfig({ accessSecret: "z".repeat(64) }),
      new FakeClock(),
    );
    const token = impostor.signAccessToken({
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    await expect(s.guard.canActivate(context(`Bearer ${token}`).ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("attaches a safe user for a valid token", async () => {
    const s = setup();
    const user = await student(s);
    const token = s.tokens.signAccessToken({
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    const { ctx, req } = context(`Bearer ${token}`);
    expect(await s.guard.canActivate(ctx)).toBe(true);
    expect(req.user).toMatchObject({ id: user.id, role: Role.STUDENT });
    expect(req.user).not.toHaveProperty("passwordHash");
  });

  it("rejects an access token whose tokenVersion is stale after logout (TC-006)", async () => {
    const s = setup();
    const user = await student(s);
    const token = s.tokens.signAccessToken({
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    await s.repo.invalidateSessions(user.id);
    await expect(s.guard.canActivate(context(`Bearer ${token}`).ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a valid token whose user no longer exists", async () => {
    const s = setup();
    const token = s.tokens.signAccessToken({
      id: "ghost-user",
      role: Role.STUDENT,
      tokenVersion: 0,
    });
    await expect(s.guard.canActivate(context(`Bearer ${token}`).ctx)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
