CREATE TYPE "ExamPhase" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED');
CREATE TYPE "ExamActionType" AS ENUM ('PUBLISHED', 'WITHDRAWN', 'ASSIGNMENTS_UPDATED');

CREATE TABLE "Exam" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "durationMinutes" TEXT,
  "maxAttempts" TEXT,
  "allowAnswerReview" BOOLEAN,
  "opensAt" TIMESTAMPTZ(3),
  "closesAt" TIMESTAMPTZ(3),
  "passwordHash" TEXT,
  "firstPublishedAt" TIMESTAMPTZ(3),
  "activePublicationId" TEXT,
  "activePhase" "ExamPhase",
  "earlyClosedAt" TIMESTAMPTZ(3),
  "snapshotHeadId" TEXT,
  "snapshotTailId" TEXT,
  "snapshotCount" BIGINT NOT NULL DEFAULT 0,
  "revision" TEXT NOT NULL,
  "lastMutationId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Exam_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exam_duration_positive_digits" CHECK (
    "durationMinutes" IS NULL OR (
      "durationMinutes" ~ '^[1-9][0-9]*$' AND "durationMinutes" !~ '[^0-9]'
    )
  ),
  CONSTRAINT "exam_max_attempts_positive_digits" CHECK (
    "maxAttempts" IS NULL OR (
      "maxAttempts" ~ '^[1-9][0-9]*$' AND "maxAttempts" !~ '[^0-9]'
    )
  ),
  CONSTRAINT "exam_snapshot_count_nonnegative" CHECK ("snapshotCount" >= 0),
  CONSTRAINT "exam_snapshot_endpoints_consistent" CHECK (
    ("snapshotCount" = 0 AND "snapshotHeadId" IS NULL AND "snapshotTailId" IS NULL)
    OR ("snapshotCount" > 0 AND "snapshotHeadId" IS NOT NULL AND "snapshotTailId" IS NOT NULL)
  ),
  CONSTRAINT "exam_active_publication_consistent" CHECK (
    (("activePublicationId" IS NULL) = ("activePhase" IS NULL))
    AND (
      "activePublicationId" IS NULL OR (
        "opensAt" IS NOT NULL AND "closesAt" IS NOT NULL AND "opensAt" < "closesAt"
        AND "durationMinutes" IS NOT NULL AND "maxAttempts" IS NOT NULL
        AND "allowAnswerReview" IS NOT NULL
      )
    )
  ),
  CONSTRAINT "exam_early_close_consistent" CHECK (
    "earlyClosedAt" IS NULL OR (
      "activePhase" = 'CLOSED'::"ExamPhase"
      AND "opensAt" IS NOT NULL AND "closesAt" IS NOT NULL
      AND "opensAt" <= "earlyClosedAt" AND "earlyClosedAt" < "closesAt"
    )
  ),
  CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Exam_teacherId_createdAt_id_idx"
  ON "Exam"("teacherId", "createdAt" DESC, "id" DESC);
CREATE INDEX "exam_active_created_at_id_idx"
  ON "Exam"("createdAt" DESC, "id" DESC)
  WHERE "activePublicationId" IS NOT NULL;

CREATE TABLE "ExamQuestionSnapshot" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "sourceQuestionId" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "nextSnapshotId" TEXT,
  CONSTRAINT "ExamQuestionSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exam_snapshot_exam_id_id_key" UNIQUE ("examId", "id"),
  CONSTRAINT "exam_snapshot_exam_source_key" UNIQUE ("examId", "sourceQuestionId"),
  CONSTRAINT "exam_snapshot_one_predecessor" UNIQUE ("examId", "nextSnapshotId")
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "exam_snapshot_exam_fkey" FOREIGN KEY ("examId")
    REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exam_snapshot_same_exam_next_fkey" FOREIGN KEY ("examId", "nextSnapshotId")
    REFERENCES "ExamQuestionSnapshot"("examId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "CurrentExamAssignment" (
  "examId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurrentExamAssignment_pkey" PRIMARY KEY ("examId", "classroomId"),
  CONSTRAINT "current_exam_assignment_exam_fkey" FOREIGN KEY ("examId")
    REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "current_exam_assignment_classroom_fkey" FOREIGN KEY ("classroomId")
    REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "current_exam_assignment_class_exam_idx"
  ON "CurrentExamAssignment"("classroomId", "examId");

CREATE TABLE "ExamActionHistory" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "ordinal" BIGINT NOT NULL,
  "action" "ExamActionType" NOT NULL,
  "actedAt" TIMESTAMPTZ(3) NOT NULL,
  "actorId" TEXT NOT NULL,
  "resultingRevision" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "ExamActionHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exam_action_exam_ordinal_key" UNIQUE ("examId", "ordinal"),
  CONSTRAINT "exam_action_ordinal_positive" CHECK ("ordinal" > 0),
  CONSTRAINT "exam_action_exam_fkey" FOREIGN KEY ("examId")
    REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "exam_action_actor_fkey" FOREIGN KEY ("actorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "exam_action_exam_ordinal_desc_idx"
  ON "ExamActionHistory"("examId", "ordinal" DESC);

CREATE INDEX "Enrollment_userId_classroomId_approved_idx"
  ON "Enrollment"("userId", "classroomId")
  WHERE "status" = 'APPROVED'::"EnrollmentStatus";
