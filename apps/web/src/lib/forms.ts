import { z, type ZodError } from "zod";
import { roleSchema } from "./schemas.js";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email là bắt buộc")
  .email("Email không hợp lệ");

export const passwordSchema = z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mật khẩu là bắt buộc"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, "Tên hiển thị là bắt buộc"),
  requestedRole: roleSchema,
  teacherCode: z.string().trim().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token đặt lại là bắt buộc"),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mật khẩu hiện tại là bắt buộc"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Tên hiển thị là bắt buộc"),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export function fieldErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "body" in error) {
    const body = (error as { body?: unknown }).body;
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Đã có lỗi không xác định";
}
