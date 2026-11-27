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
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { ClassroomDto, EnrollmentDto, OkDto } from "@quiz/shared";
import { ROLE as Role } from "../auth/utils/role-value.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import type { CurrentUser } from "./classroom.types.js";
import { ClassroomService } from "./classroom.service.js";
import { CreateClassroomDto } from "./dto/index.js";
import { classroomError } from "./errors.js";

function currentUser(req: Request): CurrentUser {
  const user = (req as Request & { user?: CurrentUser }).user;
  if (user === undefined) throw classroomError("UNAUTHORIZED", "Authentication required");
  return user;
}

@Controller("classrooms")
export class ClassroomController {
  constructor(private readonly classrooms: ClassroomService) {}

  @Roles(Role.TEACHER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: Request,
    @Body() dto: CreateClassroomDto,
  ): Promise<ApiOkBody<ClassroomDto>> {
    return { data: await this.classrooms.create(currentUser(req), dto) };
  }

  @Roles(Role.TEACHER, Role.STUDENT)
  @Get()
  async list(@Req() req: Request): Promise<ApiOkBody<ClassroomDto[]>> {
    return { data: await this.classrooms.list(currentUser(req)) };
  }

  @Roles(Role.TEACHER)
  @Get(":id/enrollments")
  async listEnrollments(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<ApiOkBody<EnrollmentDto[]>> {
    return { data: await this.classrooms.listEnrollments(currentUser(req), id) };
  }

  @Roles(Role.TEACHER)
  @Delete(":id")
  async removeClassroom(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<ApiOkBody<OkDto>> {
    return { data: await this.classrooms.removeClassroom(currentUser(req), id) };
  }

  @Roles(Role.STUDENT)
  @Post(":code/join")
  @HttpCode(HttpStatus.CREATED)
  async join(
    @Req() req: Request,
    @Param("code") code: string,
  ): Promise<ApiOkBody<EnrollmentDto>> {
    return { data: await this.classrooms.join(currentUser(req), code) };
  }

  @Roles(Role.TEACHER)
  @Patch(":id/enrollments/:userId/approve")
  async approve(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<ApiOkBody<EnrollmentDto>> {
    return { data: await this.classrooms.approve(currentUser(req), id, userId) };
  }

  @Roles(Role.TEACHER)
  @Delete(":id/enrollments/:userId")
  async removeEnrollment(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<ApiOkBody<OkDto>> {
    return { data: await this.classrooms.removeEnrollment(currentUser(req), id, userId) };
  }
}
