import { Module } from "@nestjs/common";
import { CatalogRepository, QuestionRepository } from "./ports.js";
import { PrismaCatalogRepository } from "./repositories/prisma-catalog.repository.js";
import { PrismaQuestionRepository } from "./repositories/prisma-question.repository.js";
import { QuestionsController } from "./questions.controller.js";
import { QuestionsService } from "./questions.service.js";
import { SubjectsController } from "./subjects.controller.js";

@Module({
  controllers: [QuestionsController, SubjectsController],
  providers: [
    QuestionsService,
    { provide: QuestionRepository, useClass: PrismaQuestionRepository },
    { provide: CatalogRepository, useClass: PrismaCatalogRepository },
  ],
})
export class QuestionsModule {}
