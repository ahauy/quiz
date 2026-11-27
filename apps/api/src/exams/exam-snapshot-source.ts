import type { Prisma } from "@prisma/client";
import { examError } from "./exam-errors.js";

interface SourceRow {
  id: string; type: string; content: string; difficulty: string; explanation: string;
  subjectId: string; subjectName: string; chapterId: string; chapterName: string;
  options: Array<{ id: string; text: string; isCorrect: boolean; position: number }>;
  trueFalseAnswer: boolean | null;
  fillAnswers: Array<{ text: string; normalized: string; position: number }>;
  pairs: Array<{ id: string; leftText: string; leftNormalized: string; rightText: string; rightNormalized: string; position: number }>;
}

export interface CapturedQuestion {
  question: Record<string, unknown>;
  internal: Record<string, unknown>;
}

export async function captureOwnedQuestion(
  tx: Prisma.TransactionClient,
  teacherId: string,
  sourceQuestionId: string,
): Promise<CapturedQuestion> {
  const rows = await tx.$queryRaw<SourceRow[]>`
    SELECT q."id", q."type"::text AS "type", q."content", q."difficulty"::text AS "difficulty",
      q."explanation", q."subjectId", s."name" AS "subjectName", q."chapterId", c."name" AS "chapterName",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o."id", 'text', o."text", 'isCorrect', o."isCorrect", 'position', o."position") ORDER BY o."position") FROM "QuestionOption" o WHERE o."questionId" = q."id"), '[]'::jsonb) AS "options",
      q."trueFalseAnswer",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('text', a."text", 'normalized', a."normalized", 'position', a."position") ORDER BY a."position") FROM "FillBlankAnswer" a WHERE a."questionId" = q."id"), '[]'::jsonb) AS "fillAnswers",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p."id", 'leftText', p."leftText", 'leftNormalized', p."leftNormalized", 'rightText', p."rightText", 'rightNormalized', p."rightNormalized", 'position', p."position") ORDER BY p."position") FROM "MatchingPair" p WHERE p."questionId" = q."id"), '[]'::jsonb) AS "pairs"
    FROM "Question" q
    JOIN "Subject" s ON s."id" = q."subjectId"
    JOIN "Chapter" c ON c."id" = q."chapterId" AND c."subjectId" = s."id"
    WHERE q."id" = ${sourceQuestionId} AND q."teacherId" = ${teacherId}
  `;
  const row = rows[0];
  if (!row) {
    const exists = await tx.question.findUnique({ where: { id: sourceQuestionId }, select: { id: true } });
    throw examError(exists ? "FORBIDDEN" : "SOURCE_QUESTION_NOT_FOUND", exists ? "Question belongs to another teacher" : "Source question is unavailable");
  }
  const base = { content: row.content, difficulty: row.difficulty, explanation: row.explanation, subjectId: row.subjectId, subjectName: row.subjectName, chapterId: row.chapterId, chapterName: row.chapterName };
  const options = row.options.map(({ id, text }) => ({ id, text }));
  let question: Record<string, unknown>;
  let internal: Record<string, unknown> = {};
  switch (row.type) {
    case "SINGLE_CHOICE": {
      const correct = row.options.filter((option) => option.isCorrect);
      if (correct.length !== 1) throw examError("VALIDATION_ERROR", "Question answer data is invalid", [{ field: "sourceQuestionId", reason: "QUESTION_DATA" }]);
      question = { ...base, type: row.type, options, correctOptionId: correct[0]?.id };
      internal = { correctOptionIds: correct.map(({ id }) => id) };
      break;
    }
    case "MULTIPLE_CHOICE": {
      const correctOptionIds = row.options.filter((option) => option.isCorrect).map(({ id }) => id);
      if (!correctOptionIds.length) throw examError("VALIDATION_ERROR", "Question answer data is invalid", [{ field: "sourceQuestionId", reason: "QUESTION_DATA" }]);
      question = { ...base, type: row.type, options, correctOptionIds };
      internal = { correctOptionIds };
      break;
    }
    case "TRUE_FALSE":
      if (row.trueFalseAnswer === null) throw examError("VALIDATION_ERROR", "Question answer data is invalid", [{ field: "sourceQuestionId", reason: "QUESTION_DATA" }]);
      question = { ...base, type: row.type, correctAnswer: row.trueFalseAnswer };
      internal = { correctAnswer: row.trueFalseAnswer };
      break;
    case "FILL_BLANK":
      question = { ...base, type: row.type, acceptedAnswers: row.fillAnswers.map(({ text }) => text) };
      internal = { acceptedAnswerKeys: row.fillAnswers.map(({ normalized }) => normalized) };
      break;
    case "MATCHING":
      question = { ...base, type: row.type, pairs: row.pairs.map(({ id, leftText, rightText }) => ({ id, leftText, rightText })) };
      internal = { pairs: row.pairs.map(({ leftNormalized, rightNormalized }) => ({ leftNormalized, rightNormalized })) };
      break;
    default: throw examError("VALIDATION_ERROR", "Question type is not supported", [{ field: "sourceQuestionId", reason: "QUESTION_TYPE" }]);
  }
  return { question, internal };
}

export function snapshotPayload(captured: CapturedQuestion): Prisma.InputJsonObject {
  return { version: 1, question: captured.question as Prisma.InputJsonObject, internal: captured.internal as Prisma.InputJsonObject };
}
