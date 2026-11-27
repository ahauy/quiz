import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { OkDto, QuestionDto, QuestionListDto } from "@quiz/shared";
import { ROLE } from "../auth/utils/role-value.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import { QuestionsService } from "./questions.service.js";
import type { ListQuery } from "./questions.types.js";
import { currentUser } from "./questions.types.js";
import type { PayloadInput } from "./validators/payload-validator.js";

@Controller("questions")
@Roles(ROLE.TEACHER)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: Request,
    @Body() body: PayloadInput,
  ): Promise<ApiOkBody<QuestionDto>> {
    return { data: await this.questions.create(currentUser(req), body) };
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query() query: ListQuery,
  ): Promise<ApiOkBody<QuestionListDto>> {
    return { data: await this.questions.list(currentUser(req), query) };
  }

  @Get(":id")
  async get(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<ApiOkBody<QuestionDto>> {
    return { data: await this.questions.get(currentUser(req), id) };
  }

  @Patch(":id")
  async replace(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: PayloadInput,
  ): Promise<ApiOkBody<QuestionDto>> {
    return { data: await this.questions.replace(currentUser(req), id, body) };
  }

  @Delete(":id")
  async remove(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<ApiOkBody<OkDto>> {
    return { data: await this.questions.remove(currentUser(req), id) };
  }
}
