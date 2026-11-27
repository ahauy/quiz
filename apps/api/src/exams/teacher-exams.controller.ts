import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { ExamAction, ExamAssignment, ExamQuestionSnapshot, Page, TeacherExamDetail, TeacherExamListItem } from "@quiz/shared";
import { ROLE } from "../auth/utils/role-value.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import { currentUser } from "../questions/questions.types.js";
import { ExamsService } from "./exams.service.js";

@Controller("teacher/exams")
@Roles(ROLE.TEACHER)
export class TeacherExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  async list(@Req() req: Request, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<Page<TeacherExamListItem>>> {
    const result = await this.exams.list(currentUser(req), query);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: result.page };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<TeacherExamDetail>> {
    const result = await this.exams.create(currentUser(req), body);
    res.setHeader("ETag", result.etag); res.setHeader("Location", `/teacher/exams/${result.detail.id}`);
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: result.detail };
  }

  @Get(":id")
  async get(@Req() req: Request, @Param("id") id: string, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<TeacherExamDetail>> {
    const result = await this.exams.get(currentUser(req), id);
    res.setHeader("ETag", result.etag); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: result.detail };
  }

  @Patch(":id")
  async write(@Req() req: Request, @Param("id") id: string, @Headers("if-match") ifMatch: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<TeacherExamDetail>> {
    const result = await this.exams.write(currentUser(req), id, ifMatch, body);
    res.setHeader("ETag", result.etag); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: result.detail };
  }

  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string, @Headers("if-match") ifMatch: string | undefined, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<{ ok: true }>> {
    const result = await this.exams.remove(currentUser(req), id, ifMatch);
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Exam-Server-Time", result.now.toISOString());
    return { data: { ok: true } };
  }

  @Get(":id/questions")
  async questions(@Req() req: Request, @Param("id") id: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<Page<ExamQuestionSnapshot>>> {
    const result = await this.exams.snapshots(currentUser(req), id, query);
    this.setChildHeaders(res, result.etag, result.now);
    return { data: result.page };
  }

  @Get(":id/assignments")
  async assignments(@Req() req: Request, @Param("id") id: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<Page<ExamAssignment>>> {
    const result = await this.exams.assignments(currentUser(req), id, query);
    this.setChildHeaders(res, result.etag, result.now);
    return { data: result.page };
  }

  @Get(":id/history")
  async history(@Req() req: Request, @Param("id") id: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<ApiOkBody<Page<ExamAction>>> {
    const result = await this.exams.history(currentUser(req), id, query);
    this.setChildHeaders(res, result.etag, result.now);
    return { data: result.page };
  }

  private setChildHeaders(res: Response, etag: string, now: Date): void {
    res.setHeader("X-Exam-ETag", etag); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Exam-Server-Time", now.toISOString());
  }
}
