import { Role } from "@quiz/shared";

export function roleHome(role: Role): string {
  return role === Role.TEACHER ? "/teacher" : "/student";
}
