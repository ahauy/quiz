import type { Role } from "@quiz/shared";
import { ROLE } from "../utils/role-value.js";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsIn([ROLE.TEACHER, ROLE.STUDENT])
  requestedRole?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  teacherCode?: string;
}
