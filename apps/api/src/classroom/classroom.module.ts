import { Module } from "@nestjs/common";
import { ClassroomController } from "./classroom.controller.js";
import { ClassroomService } from "./classroom.service.js";
import { ClassCodeGenerator, CryptoClassCodeGenerator } from "./ports.js";
import { ClassroomRepository } from "./repositories/classroom.repository.js";
import { PrismaClassroomRepository } from "./repositories/prisma-classroom.repository.js";

@Module({
  controllers: [ClassroomController],
  providers: [
    ClassroomService,
    { provide: ClassroomRepository, useClass: PrismaClassroomRepository },
    { provide: ClassCodeGenerator, useClass: CryptoClassCodeGenerator },
  ],
})
export class ClassroomModule {}
