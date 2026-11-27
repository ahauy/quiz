import { Module } from "@nestjs/common";
import { ExamsService } from "./exams.service.js";
import { PrismaExamRepository } from "./prisma-exam.repository.js";
import { TeacherExamsController } from "./teacher-exams.controller.js";
import { StudentExamsController } from "./student-exams.controller.js";
import { StudentExamProjection } from "./student-exam.projection.js";

@Module({ controllers: [TeacherExamsController, StudentExamsController], providers: [ExamsService, PrismaExamRepository, StudentExamProjection], exports: [ExamsService] })
export class ExamsModule {}
