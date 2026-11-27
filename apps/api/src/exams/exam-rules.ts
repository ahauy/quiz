import type { ExamStatus } from "@quiz/shared";
import type { ExamPhase } from "@prisma/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function canonicalPositiveInteger(value: unknown): value is string {
  return typeof value === "string" && POSITIVE_INTEGER.test(value);
}

export function parseExamInstant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = INSTANT.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > days) return null;
  if (!zone) return null;
  if (zone !== "Z") {
    const [zh, zm] = zone.slice(1).split(":").map(Number);
    if (zh === undefined || zm === undefined || zh > 23 || zm > 59) return null;
  }
  const normalized = `${y}-${mo}-${d}T${h}:${mi}:${s}.${(fraction ?? "").padEnd(3, "0")}${zone}`;
  const result = new Date(normalized);
  return Number.isNaN(result.getTime()) ? null : result;
}

const PHASE_RANK: Record<ExamPhase, number> = { SCHEDULED: 0, OPEN: 1, CLOSED: 2 };

export function effectiveExamStatus(
  stored: ExamPhase,
  opensAt: Date | string,
  closesAt: Date | string,
  now: Date,
): Exclude<ExamStatus, "DRAFT"> {
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  const sampled = now.getTime() >= close ? "CLOSED" : now.getTime() >= open ? "OPEN" : "SCHEDULED";
  const phase = PHASE_RANK[stored] >= PHASE_RANK[sampled] ? stored : sampled;
  return phase;
}

export function decimalAtMost(value: string, maximum: bigint): boolean {
  const limit = maximum.toString();
  return value.length < limit.length || (value.length === limit.length && value <= limit);
}

export function exactMinuteWindow(opensAt: Date, closesAt: Date): bigint {
  return BigInt(Math.floor((closesAt.getTime() - opensAt.getTime()) / 60_000));
}
