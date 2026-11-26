import { z } from "zod";
import { Role } from "@quiz/shared";

// Runtime mirrors of packages/shared DTOs + the API envelopes (context-pack.md §API contract).
// The shared package only ships TS interfaces, so the web validates responses with local zod.

export const roleSchema = z.enum([Role.TEACHER, Role.STUDENT] as const);

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
});

export const authResultSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});

export const authUrlSchema = z.object({
  url: z.string(),
});

export const forgotPasswordResultSchema = z.object({
  message: z.string(),
  resetUrl: z.string().optional(),
});

export const okSchema = z.object({
  ok: z.literal(true),
});

export const successEnvelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });

export const errorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type User = z.infer<typeof userSchema>;
export type AuthResult = z.infer<typeof authResultSchema>;
export type AuthUrl = z.infer<typeof authUrlSchema>;
export type ForgotPasswordResult = z.infer<typeof forgotPasswordResultSchema>;
export type Ok = z.infer<typeof okSchema>;
