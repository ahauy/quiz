import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ClassroomModule } from "./classroom/classroom.module.js";
import { QuestionsModule } from "./questions/questions.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { ExamsModule } from "./exams/exams.module.js";
import { validateEnv } from "./config/env.schema.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ["../../.env", ".env"],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClassroomModule,
    QuestionsModule,
    AssetsModule,
    ExamsModule,
  ],
})
export class AppModule {}
