import type { Prisma } from "@prisma/client";

export interface LockedTeacher { id: string; role: string }

export async function lockTeacherForExamWrite(
  tx: Prisma.TransactionClient,
  teacherId: string,
): Promise<LockedTeacher | null> {
  const rows = await tx.$queryRaw<LockedTeacher[]>`
    SELECT "id", "role" FROM "User" WHERE "id" = ${teacherId} FOR NO KEY UPDATE
  `;
  return rows[0] ?? null;
}
