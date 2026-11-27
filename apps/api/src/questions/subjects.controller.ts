import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import type { SubjectDto } from "@quiz/shared";
import { ROLE } from "../auth/utils/role-value.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import { QuestionsService } from "./questions.service.js";
import { currentUser } from "./questions.types.js";

@Controller("subjects")
@Roles(ROLE.TEACHER)
export class SubjectsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  async list(@Req() req: Request): Promise<ApiOkBody<SubjectDto[]>> {
    return { data: await this.questions.listSubjects(currentUser(req)) };
  }
}
