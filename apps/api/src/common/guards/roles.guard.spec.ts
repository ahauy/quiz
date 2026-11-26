import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@quiz/shared";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import { RolesGuard } from "./roles.guard.js";

function context(
  required: readonly Role[] | undefined,
  user: { id: string; role: Role } | undefined,
): ExecutionContext {
  const handler = () => undefined;
  if (required) Reflect.defineMetadata(ROLES_KEY, required, handler);
  const req: { user?: unknown } = {};
  if (user) req.user = user;
  return {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("allows routes with no @Roles metadata", () => {
    expect(guard.canActivate(context(undefined, undefined))).toBe(true);
  });

  it("allows a user whose role is required", () => {
    expect(
      guard.canActivate(context([Role.TEACHER], { id: "u1", role: Role.TEACHER })),
    ).toBe(true);
  });

  it("denies a wrong role with 403 (TC-007)", () => {
    expect(() =>
      guard.canActivate(context([Role.TEACHER], { id: "u1", role: Role.STUDENT })),
    ).toThrow(ForbiddenException);
  });

  it("denies an unauthenticated request to a role-protected route", () => {
    expect(() => guard.canActivate(context([Role.TEACHER], undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
