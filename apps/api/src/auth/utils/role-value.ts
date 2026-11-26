import type { Role } from "@quiz/shared";

// Runtime mirror of the shared Role enum. The API compiles to CommonJS and runs
// via `node dist/main.js`, which cannot load @quiz/shared's TypeScript source
// (its `.js` ESM-style imports are not remapped to `.ts` by Node). All type
// imports still come from packages/shared; `satisfies` keeps these two values
// in lockstep with that enum so a future role change fails typecheck here.
export const ROLE = {
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
} as const satisfies Record<Role, Role>;
