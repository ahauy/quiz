import type { ReactNode } from "react";
import type { Role } from "@quiz/shared";
import { useAuthStore } from "../stores/auth-store.js";

interface GuardProps {
  allow: readonly Role[];
  children: ReactNode;
}

// Skeleton only — real route table arrives with US-AUTH-001.
export function RoleGuard({ allow, children }: GuardProps) {
  const role = useAuthStore((state) => state.role);
  if (!role || !allow.includes(role)) return null;
  return <>{children}</>;
}
