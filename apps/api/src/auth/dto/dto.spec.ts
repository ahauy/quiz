import "reflect-metadata";
import { Role } from "@quiz/shared";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  ForgotPasswordDto,
  GoogleCallbackDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
} from "./index.js";

const options = { whitelist: true, forbidNonWhitelisted: true } as const;

function make<T extends object>(Ctor: new () => T, data: Record<string, unknown>): T {
  return Object.assign(new Ctor(), data);
}

describe("auth DTO validation", () => {
  it("accepts a valid registration", async () => {
    const errors = await validate(
      make(RegisterDto, { email: "a@b.com", password: "password123", displayName: "A" }),
      options,
    );
    expect(errors).toHaveLength(0);
  });

  it("rejects ADMIN as requestedRole (TC-004, exactly two roles)", async () => {
    const errors = await validate(
      make(RegisterDto, {
        email: "a@b.com",
        password: "password123",
        displayName: "A",
        requestedRole: "ADMIN" as unknown as Role,
      }),
      options,
    );
    expect(errors.some((e) => e.property === "requestedRole")).toBe(true);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const errors = await validate(
      make(RegisterDto, { email: "a@b.com", password: "short", displayName: "A" }),
      options,
    );
    expect(errors.some((e) => e.property === "password")).toBe(true);
  });

  it("rejects a malformed email", async () => {
    const errors = await validate(
      make(LoginDto, { email: "not-an-email", password: "password123" }),
      options,
    );
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("forbids non-whitelisted properties", async () => {
    const errors = await validate(
      make(RegisterDto, {
        email: "a@b.com",
        password: "password123",
        displayName: "A",
        isAdmin: true,
      }),
      options,
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("requires an email on forgot-password", async () => {
    const errors = await validate(make(ForgotPasswordDto, {}), options);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });

  it("requires token and an 8-char newPassword on reset", async () => {
    const missing = await validate(make(ResetPasswordDto, { token: "t" }), options);
    expect(missing.some((e) => e.property === "newPassword")).toBe(true);
    const short = await validate(
      make(ResetPasswordDto, { token: "t", newPassword: "short" }),
      options,
    );
    expect(short.some((e) => e.property === "newPassword")).toBe(true);
  });

  it("requires code and state on the google callback", async () => {
    const errors = await validate(make(GoogleCallbackDto, { code: "c" }), options);
    expect(errors.some((e) => e.property === "state")).toBe(true);
  });

  it("keeps updateMe fields optional but enforces the password minimum", async () => {
    const empty = await validate(make(UpdateMeDto, {}), options);
    expect(empty).toHaveLength(0);
    const short = await validate(make(UpdateMeDto, { newPassword: "short" }), options);
    expect(short.some((e) => e.property === "newPassword")).toBe(true);
  });
});
