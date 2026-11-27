-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "explanation" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "trueFalseAnswer" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FillBlankAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FillBlankAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingPair" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "leftText" TEXT NOT NULL,
    "leftNormalized" TEXT NOT NULL,
    "rightText" TEXT NOT NULL,
    "rightNormalized" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MatchingPair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subject_teacherId_idx" ON "Subject"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_teacherId_nameKey_key" ON "Subject"("teacherId", "nameKey");

-- CreateIndex
CREATE INDEX "Chapter_subjectId_idx" ON "Chapter"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_subjectId_nameKey_key" ON "Chapter"("subjectId", "nameKey");

-- CreateIndex
CREATE INDEX "Question_teacherId_updatedAt_idx" ON "Question"("teacherId", "updatedAt");

-- CreateIndex
CREATE INDEX "Question_teacherId_subjectId_chapterId_idx" ON "Question"("teacherId", "subjectId", "chapterId");

-- CreateIndex
CREATE INDEX "Question_teacherId_difficulty_idx" ON "Question"("teacherId", "difficulty");

-- CreateIndex
CREATE INDEX "Question_teacherId_type_idx" ON "Question"("teacherId", "type");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "FillBlankAnswer_questionId_idx" ON "FillBlankAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "FillBlankAnswer_questionId_normalized_key" ON "FillBlankAnswer"("questionId", "normalized");

-- CreateIndex
CREATE INDEX "MatchingPair_questionId_idx" ON "MatchingPair"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingPair_questionId_leftNormalized_key" ON "MatchingPair"("questionId", "leftNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingPair_questionId_rightNormalized_key" ON "MatchingPair"("questionId", "rightNormalized");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillBlankAnswer" ADD CONSTRAINT "FillBlankAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingPair" ADD CONSTRAINT "MatchingPair_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
