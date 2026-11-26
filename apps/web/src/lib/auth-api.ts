import type { RegisterDto } from "@quiz/shared";
import { apiRequest } from "./api-client.js";
import {
  authResultSchema,
  authUrlSchema,
  forgotPasswordResultSchema,
  okSchema,
  userSchema,
  type AuthResult,
  type AuthUrl,
  type ForgotPasswordResult,
  type Ok,
  type User,
} from "./schemas.js";
import type { LoginInput } from "./forms.js";

// Typed wrappers over the auth API contract (context-pack.md §API contract, unprefixed paths).

export interface GoogleCallbackInput {
  code: string;
  state: string;
  teacherCode?: string;
}

export interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

export interface UpdateMeBody {
  displayName?: string;
  newPassword?: string;
  currentPassword?: string;
}

export function register(input: RegisterDto): Promise<User> {
  return apiRequest("/auth/register", { method: "POST", body: input, schema: userSchema });
}

export function login(input: LoginInput): Promise<AuthResult> {
  return apiRequest("/auth/login", { method: "POST", body: input, schema: authResultSchema });
}

export function logout(): Promise<Ok> {
  return apiRequest("/auth/logout", { method: "POST", schema: okSchema });
}

export function googleAuthUrl(): Promise<AuthUrl> {
  return apiRequest("/auth/oauth/google/url", { schema: authUrlSchema });
}

export function googleCallback(input: GoogleCallbackInput): Promise<AuthResult> {
  return apiRequest("/auth/oauth/google/callback", {
    method: "POST",
    body: input,
    schema: authResultSchema,
  });
}

export function forgotPassword(input: { email: string }): Promise<ForgotPasswordResult> {
  return apiRequest("/auth/forgot-password", {
    method: "POST",
    body: input,
    schema: forgotPasswordResultSchema,
  });
}

export function resetPassword(input: ResetPasswordBody): Promise<Ok> {
  return apiRequest("/auth/reset-password", {
    method: "POST",
    body: input,
    schema: okSchema,
  });
}

export function getMe(): Promise<User> {
  return apiRequest("/auth/me", { schema: userSchema });
}

export function updateMe(input: UpdateMeBody): Promise<User> {
  return apiRequest("/auth/me", { method: "PATCH", body: input, schema: userSchema });
}
