import { ExamActionType, ExamStatus } from "@quiz/shared";
import { z } from "zod";
import {
  choiceOptionSchema,
  fillBlankQuestionVariantSchema,
  matchingPairSchema,
  matchingQuestionVariantSchema,
  multipleChoiceQuestionVariantSchema,
  questionBaseSchema,
  singleChoiceQuestionVariantSchema,
  trueFalseQuestionVariantSchema,
} from "../questions/schemas.js";

const uuidPatternSource = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uuidPattern = new RegExp(`^${uuidPatternSource}$`, "i");
export const uuidSchema = z.string().regex(uuidPattern);

function isPostgresText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

const examTitleSchema = z.string().refine((value) => value.trim().length > 0).refine(isPostgresText);

function isCanonicalDigits(value: string, allowZero: boolean): boolean {
  const pattern = allowZero ? /^(?:0|[1-9][0-9]*)/ : /^[1-9][0-9]*/;
  return pattern.exec(value)?.[0] === value;
}

export const positiveDecimalSchema = z.string().refine((value) => isCanonicalDigits(value, false));
export const nonNegativeDecimalSchema = z.string().refine((value) => isCanonicalDigits(value, true));

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isExamTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHourText !== undefined && offsetMinuteText !== undefined) {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetMinute > 59 || offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

export const examTimestampSchema = z.string().refine(isExamTimestamp, "Invalid ISO calendar instant");
const nullableTimestampSchema = examTimestampSchema.nullable();
const examStatusSchema = z.enum([ExamStatus.DRAFT, ExamStatus.SCHEDULED, ExamStatus.OPEN, ExamStatus.CLOSED]);
const studentExamStatusSchema = z.enum([ExamStatus.SCHEDULED, ExamStatus.OPEN, ExamStatus.CLOSED]);

export const pageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() }).strict();

export const teacherExamListItemSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  state: examStatusSchema,
  questionCount: nonNegativeDecimalSchema,
  opensAt: nullableTimestampSchema,
  closesAt: nullableTimestampSchema,
}).strict();

export const teacherExamDetailSchema = teacherExamListItemSchema.extend({
  durationMinutes: positiveDecimalSchema.nullable(),
  maxAttempts: positiveDecimalSchema.nullable(),
  allowAnswerReview: z.boolean().nullable(),
  passwordRequired: z.boolean(),
  earlyClosedAt: nullableTimestampSchema,
  everPublished: z.boolean(),
  lastMutationId: uuidSchema,
}).strict();

export const studentExamMetadataSchema = z.object({
  title: z.string(),
  teacherName: z.string(),
  questionCount: positiveDecimalSchema,
  durationMinutes: positiveDecimalSchema,
  opensAt: examTimestampSchema,
  closesAt: examTimestampSchema,
  state: studentExamStatusSchema,
  maxAttempts: positiveDecimalSchema,
  passwordRequired: z.boolean(),
  allowAnswerReview: z.boolean(),
  qualifyingClassroomNames: z.array(z.string()),
}).strict();

export const studentExamListItemSchema = z.object({
  detailPath: z.string().regex(new RegExp(`^/student/exams/${uuidPatternSource}$`, "i")),
  metadata: studentExamMetadataSchema,
}).strict();

const snapshotQuestionBaseSchema = questionBaseSchema.pick({
  content: true,
  difficulty: true,
  explanation: true,
  subjectId: true,
  subjectName: true,
  chapterId: true,
  chapterName: true,
}).strict();

const snapshotSingleChoiceVariantSchema = singleChoiceQuestionVariantSchema.extend({
  options: z.array(choiceOptionSchema.strict()),
});
const snapshotMultipleChoiceVariantSchema = multipleChoiceQuestionVariantSchema.extend({
  options: z.array(choiceOptionSchema.strict()),
});
const snapshotMatchingVariantSchema = matchingQuestionVariantSchema.extend({
  pairs: z.array(matchingPairSchema.strict()),
});

export const examSnapshotQuestionSchema = z.discriminatedUnion("type", [
  snapshotQuestionBaseSchema.merge(snapshotSingleChoiceVariantSchema.strict()).strict(),
  snapshotQuestionBaseSchema.merge(snapshotMultipleChoiceVariantSchema.strict()).strict(),
  snapshotQuestionBaseSchema.merge(trueFalseQuestionVariantSchema.strict()).strict(),
  snapshotQuestionBaseSchema.merge(fillBlankQuestionVariantSchema.strict()).strict(),
  snapshotQuestionBaseSchema.merge(snapshotMatchingVariantSchema.strict()).strict(),
]);

export const examQuestionSnapshotSchema = z.object({
  id: uuidSchema,
  sourceQuestionId: uuidSchema,
  capturedAt: examTimestampSchema,
  question: examSnapshotQuestionSchema,
}).strict();

const examActionBaseSchema = { id: uuidSchema, at: examTimestampSchema, actorId: uuidSchema };
export const examActionSchema = z.discriminatedUnion("type", [
  z.object({ ...examActionBaseSchema, type: z.literal(ExamActionType.PUBLISHED), classroomIds: z.array(uuidSchema), opensAt: examTimestampSchema, closesAt: examTimestampSchema }).strict(),
  z.object({ ...examActionBaseSchema, type: z.literal(ExamActionType.WITHDRAWN), publicationEventId: uuidSchema }).strict(),
  z.object({ ...examActionBaseSchema, type: z.literal(ExamActionType.ASSIGNMENTS_UPDATED), addedClassroomIds: z.array(uuidSchema), removedClassroomIds: z.array(uuidSchema) }).strict(),
]);

export const examAssignmentSchema = z.object({ classroomId: uuidSchema, name: z.string() }).strict();

export const saveSettingsSchema = z.object({
  title: examTitleSchema.optional(),
  durationMinutes: positiveDecimalSchema.nullable().optional(),
  maxAttempts: positiveDecimalSchema.nullable().optional(),
  allowAnswerReview: z.boolean().nullable().optional(),
  opensAt: nullableTimestampSchema.optional(),
  closesAt: nullableTimestampSchema.optional(),
  password: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("set"), value: z.string().min(1) }).strict(),
    z.object({ mode: z.literal("disable") }).strict(),
  ]).optional(),
}).strict();

export const teacherExamWriteRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("saveSettings"), mutationId: uuidSchema, settings: saveSettingsSchema }).strict(),
  z.object({ op: z.literal("addQuestion"), mutationId: uuidSchema, sourceQuestionId: uuidSchema }).strict(),
  z.object({ op: z.literal("removeQuestion"), mutationId: uuidSchema, snapshotId: uuidSchema }).strict(),
  z.object({ op: z.literal("moveQuestion"), mutationId: uuidSchema, snapshotId: uuidSchema, beforeSnapshotId: uuidSchema.nullable() }).strict(),
  z.object({ op: z.literal("refreshQuestion"), mutationId: uuidSchema, snapshotId: uuidSchema }).strict(),
  z.object({
    op: z.literal("updateAssignments"), mutationId: uuidSchema,
    addClassroomIds: z.array(uuidSchema), removeClassroomIds: z.array(uuidSchema),
  }).strict(),
  z.object({ op: z.literal("publish"), mutationId: uuidSchema }).strict(),
  z.object({ op: z.literal("withdraw"), mutationId: uuidSchema }).strict(),
  z.object({ op: z.literal("closeEarly"), mutationId: uuidSchema }).strict(),
]).superRefine((value, context) => {
  if (value.op !== "updateAssignments") return;
  if (new Set(value.addClassroomIds).size !== value.addClassroomIds.length) context.addIssue({ code: "custom", message: "Duplicate classroom", path: ["addClassroomIds"] });
  if (new Set(value.removeClassroomIds).size !== value.removeClassroomIds.length) context.addIssue({ code: "custom", message: "Duplicate classroom", path: ["removeClassroomIds"] });
  if (value.addClassroomIds.some((id) => value.removeClassroomIds.includes(id))) context.addIssue({ code: "custom", message: "Overlapping classroom sets", path: ["removeClassroomIds"] });
});

export const examCreateRequestSchema = z.object({ id: uuidSchema, title: examTitleSchema, mutationId: uuidSchema }).strict();
export const examListQuerySchema = z.object({
  state: examStatusSchema.optional(),
  cursor: z.string().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
}).strict();
export const studentExamListQuerySchema = examListQuerySchema.extend({ state: studentExamStatusSchema.optional() }).strict();

export type TeacherExamListItemWire = z.infer<typeof teacherExamListItemSchema>;
export type TeacherExamDetailWire = z.infer<typeof teacherExamDetailSchema>;
export type StudentExamMetadataWire = z.infer<typeof studentExamMetadataSchema>;
export type StudentExamListItemWire = z.infer<typeof studentExamListItemSchema>;
export type ExamQuestionSnapshotWire = z.infer<typeof examQuestionSnapshotSchema>;
export type ExamActionWire = z.infer<typeof examActionSchema>;
export type ExamAssignmentWire = z.infer<typeof examAssignmentSchema>;
