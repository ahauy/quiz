import { z } from "zod";

export const tokenResponseSchema = z.object({ id_token: z.string().min(1) });
export const tokenInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.union([z.string(), z.boolean()]),
  aud: z.string().optional(),
  name: z.string().optional(),
});
