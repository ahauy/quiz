import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/** Strict public URL shape: /uploads/<uuid>.<image extension>. */
const UUID_IMAGE = /^\/[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif)$/;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function notFound(res: Response): void {
  res.status(404).json({ code: "QUESTION_NOT_FOUND", message: "Asset not found" });
}

/**
 * Register the only unauthenticated route in this feature: GET /uploads/:filename.
 * Anything outside the UUID-image pattern (including nested paths and traversal)
 * is rejected with 404 before any file is read. Files are served with Node's fs
 * rather than `express.static`: express is only a transitive dependency of
 * @nestjs/platform-express and is not directly resolvable under pnpm's strict
 * node_modules layout.
 */
export function registerUploads(app: INestApplication, uploadDir: string): void {
  mkdirSync(uploadDir, { recursive: true });

  app.use("/uploads", (req: Request, res: Response, next: NextFunction): void => {
    const pathname = req.url.split("?")[0] ?? "";
    if (!UUID_IMAGE.test(pathname)) {
      notFound(res);
      return;
    }
    next();
  });

  app.use("/uploads", (req: Request, res: Response, next: NextFunction): void => {
    const filename = (req.url.split("?")[0] ?? "").slice(1);
    void readFile(join(uploadDir, filename))
      .then((bytes) => {
        const mimeType = MIME_BY_EXTENSION[extname(filename).toLowerCase()];
        if (mimeType !== undefined) res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", bytes.length);
        res.status(200).end(bytes);
      })
      .catch(() => next());
  });

  app.use("/uploads", (_req: Request, res: Response): void => notFound(res));
}
