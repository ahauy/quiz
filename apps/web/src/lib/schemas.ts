import { z } from "zod";
import { EnrollmentStatus, Role } from "@quiz/shared";

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

// Runtime mirrors of the classroom DTOs (contract.md §Shared package).
export const classroomSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  teacherId: z.string(),
  createdAt: z.string(),
});

export const enrollmentStatusSchema = z.enum([
  EnrollmentStatus.PENDING,
  EnrollmentStatus.APPROVED,
] as const);

export const enrollmentSchema = z.object({
  id: z.string(),
  classroomId: z.string(),
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  status: enrollmentStatusSchema,
  createdAt: z.string(),
  // Omitted while PENDING (exactOptionalPropertyTypes).
  approvedAt: z.string().optional(),
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
export type Classroom = z.infer<typeof classroomSchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
