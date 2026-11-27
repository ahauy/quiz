import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { AssetUploadResultDto } from "@quiz/shared";
import { questionError } from "../questions/errors.js";
import { sniffImage } from "./image-sniff.js";

/** 5 MB, also used as the Multer limit (BR-QB-015). */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** Injection token overridden in tests with a temporary upload directory. */
export const UPLOAD_DIR = Symbol("UPLOAD_DIR");

/** The subset of an uploaded file that storage needs (no multer type import). */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class AssetStorageService {
  constructor(@Inject(UPLOAD_DIR) private readonly uploadDir: string) {}

  async store(file: UploadedImage | undefined): Promise<AssetUploadResultDto> {
    const bytes = file?.buffer;
    if (bytes === undefined || bytes.length === 0) {
      throw questionError("VALIDATION_ERROR", "A non-empty image file is required");
    }
    if (bytes.length > MAX_ASSET_BYTES || (file?.size ?? 0) > MAX_ASSET_BYTES) {
      throw questionError("FILE_TOO_LARGE", "Image exceeds the 5 MB limit");
    }
    const image = sniffImage(bytes);
    if (image === null) {
      throw questionError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Only png, jpeg, webp and gif images are supported",
      );
    }

    // The client filename is never used on disk: no path traversal, UUID only.
    const filename = `${randomUUID()}.${image.extension}`;
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(join(this.uploadDir, filename), bytes);
    return { url: `/uploads/${filename}`, mimeType: image.mimeType, size: bytes.length };
  }
}
