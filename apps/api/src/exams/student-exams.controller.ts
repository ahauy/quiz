import { Controller, Get, Inject, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Page, StudentExamListItem, StudentExamMetadata } from "@quiz/shared";
import { ROLE } from "../auth/utils/role-value.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import { currentUser } from "../questions/questions.types.js";
import { StudentExamProjection } from "./student-exam.projection.js";

@Controller("student/exams")
@Roles(ROLE.STUDENT)
export class StudentExamsController {
  constructor(@Inject(StudentExamProjection) private readonly exams: StudentExamProjection) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<Page<StudentExamListItem>>> {
    const result = await this.exams.list(currentUser(req), query);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: result.page };
  }

  @Get(":id")
  async detail(
    @Req() req: Request,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<StudentExamMetadata>> {
    const result = await this.exams.detail(currentUser(req), id);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: result.metadata };
  }
}
