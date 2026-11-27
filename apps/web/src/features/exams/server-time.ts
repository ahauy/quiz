import { isExamTimestamp } from "./schemas.js";

const serverTimeHeader = "X-Exam-Server-Time";
const vietnamTimeZone = "Asia/Ho_Chi_Minh";

function validCalendarParts(year: number, month: number, day: number, hour: number, minute: number, second = 0): boolean {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= (monthDays[month - 1] ?? 0) && hour <= 23 && minute <= 59 && second <= 59;
}

export function readExamServerTime(headers: Pick<Headers, "get">): string | null {
  const raw = headers.get(serverTimeHeader);
  return raw !== null && isExamTimestamp(raw) ? raw : null;
}

export function examRefreshDelayMs(serverTime: string, nextBoundary: string): number | null {
  if (!isExamTimestamp(serverTime) || !isExamTimestamp(nextBoundary)) return null;
  return Math.max(0, Date.parse(nextBoundary) - Date.parse(serverTime));
}

export function vietnamLocalDateTimeToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  if (!validCalendarParts(Number(yearText), Number(monthText), Number(dayText), Number(hourText), Number(minuteText), Number(secondText ?? "0"))) return null;
  const [, , , , , , , fractionText] = match;
  const requested = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: Number(hourText), minute: Number(minuteText),
    second: Number(secondText ?? "0"), millisecond: Number((fractionText ?? "").padEnd(3, "0") || "0"),
  };
  const localEpoch = epochFromParts(requested);
  const offsetAtGuess = epochFromParts(vietnamParts(new Date(localEpoch))) - localEpoch;
  const instant = new Date(localEpoch - offsetAtGuess);
  const actual = vietnamParts(instant);
  if (!sameParts(requested, actual)) return null;
  return instant.toISOString();
}

interface CalendarParts { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number }
function epochFromParts(parts: CalendarParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime();
}
function vietnamParts(date: Date): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: vietnamTimeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    fractionalSecondDigits: 3, hourCycle: "h23",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(fields.year), month: Number(fields.month), day: Number(fields.day), hour: Number(fields.hour), minute: Number(fields.minute),
    second: Number(fields.second), millisecond: Number(fields.fractionalSecond),
  };
}
function sameParts(left: CalendarParts, right: CalendarParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour
    && left.minute === right.minute && left.second === right.second && left.millisecond === right.millisecond;
}

export function formatExamInstantInVietnam(value: string): string | null {
  if (!isExamTimestamp(value)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: vietnamTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year?.padStart(4, "0")}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}.${fields.fractionalSecond}`;
}
