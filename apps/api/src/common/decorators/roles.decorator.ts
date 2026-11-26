import { SetMetadata } from "@nestjs/common";
import type { Role } from "@quiz/shared";

export const ROLES_KEY = "roles";
export const Roles = (...roles: readonly Role[]) => SetMetadata(ROLES_KEY, roles);
