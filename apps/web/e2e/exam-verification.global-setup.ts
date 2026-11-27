import { readFile } from "node:fs/promises";
import { assertFixtureMarker } from "./run-exam-verification.mjs";

export default async function verifyIsolatedStack(): Promise<void> {
  const file = process.env.EXAM_VERIFY_SETUP_FILE;
  if (!file) throw new Error("Missing isolated fixture identity");
  const identity: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!identity || typeof identity !== "object" || !("apiUrl" in identity)
      || !("examId" in identity) || !("title" in identity) || !("accessToken" in identity)) {
    throw new Error("Invalid isolated fixture identity");
  }
  const { apiUrl, examId, title, accessToken } = identity;
  if (typeof apiUrl !== "string" || typeof examId !== "string"
      || typeof title !== "string" || typeof accessToken !== "string") {
    throw new Error("Invalid isolated fixture identity");
  }
  await assertFixtureMarker({ apiUrl, examId, title, accessToken });
}
