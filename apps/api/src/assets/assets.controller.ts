import {
  CallHandler,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestInterceptor,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AssetUploadResultDto } from "@quiz/shared";
import { ROLE as Role } from "../auth/utils/role-value.js";
import { Observable, catchError, throwError } from "rxjs";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import { questionError } from "../questions/errors.js";
import {
  AssetStorageService,
  MAX_ASSET_BYTES,
  type UploadedImage,
} from "./asset-storage.service.js";

function isFileTooLarge(error: unknown): boolean {
  if (
    error instanceof Error &&
    (error as Error & { code?: string }).code === "LIMIT_FILE_SIZE"
  ) {
    return true;
  }
  // FileInterceptor rewraps Multer's LIMIT_FILE_SIZE as a PayloadTooLargeException.
  return error instanceof HttpException && error.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE;
}

/** Multer's LIMIT_FILE_SIZE must become 413 FILE_TOO_LARGE, never a generic error. */
@Injectable()
class MulterErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() =>
          isFileTooLarge(error)
            ? questionError("FILE_TOO_LARGE", "Image exceeds the 5 MB limit")
            : error,
        ),
      ),
    );
  }
}

@Controller("assets")
@Roles(Role.TEACHER)
export class AssetsController {
  // Explicit token: esbuild (Vitest) does not emit design:paramtypes metadata.
  constructor(@Inject(AssetStorageService) private readonly assets: AssetStorageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    MulterErrorsInterceptor,
    FileInterceptor("file", { limits: { fileSize: MAX_ASSET_BYTES } }),
  )
  async upload(@UploadedFile() file: UploadedImage): Promise<ApiOkBody<AssetUploadResultDto>> {
    return { data: await this.assets.store(file) };
  }
}
