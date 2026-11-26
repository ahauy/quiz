import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class GoogleCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  teacherCode?: string;
}
