import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createAuthConfig } from "../src/auth/auth.config.js";
import { TokenService } from "../src/auth/services/token.service.js";
import { createExamVerificationClient } from "./exam-verification-db.js";

describe.runIf(Boolean(process.env.EXAM_VERIFY_SETUP_FILE))("isolated browser fixture", () => {
  it("seeds a private Draft marker and short-lived access proof in the verified target", async () => {
    const file = process.env.EXAM_VERIFY_SETUP_FILE;
    const nonce = process.env.EXAM_VERIFY_NONCE;
    if (!file || !nonce) throw new Error("The isolated launcher must provide fixture identity");
    const client = await createExamVerificationClient();
    try {
      const teacher = await client.user.create({ data: {
        email: `exam-marker-${randomUUID()}@example.test`, displayName: "Giáo viên kiểm thử", role: "TEACHER",
      } });
      const exam = await client.exam.create({ data: {
        teacherId: teacher.id, title: `exam-verification-${nonce}`, lastMutationId: randomUUID(),
      } });
      const tokens = new TokenService(createAuthConfig(), { now: () => new Date() });
      const identity = {
        apiUrl: "http://localhost:3000", examId: exam.id, title: exam.title,
        accessToken: tokens.signAccessToken(teacher),
      };
      await writeFile(file, JSON.stringify(identity), { mode: 0o600, flag: "wx" });
      const saved: unknown = JSON.parse(await readFile(file, "utf8"));
      expect(saved).toMatchObject({ examId: exam.id, title: `exam-verification-${nonce}` });
      expect(tokens.verifyAccessToken(identity.accessToken).sub).toBe(teacher.id);
      expect(exam.activePublicationId).toBeNull();
    } finally { await client.$disconnect(); }
  });
});
