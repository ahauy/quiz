import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Role } from "@quiz/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { SystemClock } from "../auth/ports.js";
import { TokenService } from "../auth/services/token.service.js";
import { InMemoryAuthRepository, testAuthConfig } from "../auth/testing/fakes.js";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { AssetsController } from "./assets.controller.js";
import { AssetStorageService, MAX_ASSET_BYTES, UPLOAD_DIR } from "./asset-storage.service.js";
import { registerUploads } from "./static-uploads.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let app: INestApplication;
let uploadDir: string;
let baseUrl: string;
let teacherToken: string;
let studentToken: string;

function multipart(bytes: Buffer, filename: string, mimeType: string): FormData {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  return form;
}

async function fileCount(): Promise<number> {
  return (await readdir(uploadDir)).length;
}

beforeAll(async () => {
  uploadDir = await mkdtemp(join(tmpdir(), "quiz-assets-"));

  // Vitest/esbuild does not emit design:paramtypes, so the auth seam is wired
  // explicitly (in-memory users, real JWT signing). The HTTP stack, multer
  // interceptor, storage service, exception filter and static route are real.
  const tokens = new TokenService(testAuthConfig(), new SystemClock());
  const reflector = new Reflector();
  const users = new InMemoryAuthRepository();
  const teacher = await users.createUser({
    email: `asset-teacher-${randomUUID()}@example.test`,
    displayName: "Asset Teacher",
    passwordHash: null,
    role: Role.TEACHER,
  });
  const student = await users.createUser({
    email: `asset-student-${randomUUID()}@example.test`,
    displayName: "Asset Student",
    passwordHash: null,
    role: Role.STUDENT,
  });

  const moduleRef = await Test.createTestingModule({
    controllers: [AssetsController],
    providers: [
      AssetStorageService,
      { provide: UPLOAD_DIR, useValue: uploadDir },
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalGuards(
    new JwtAuthGuard(reflector, tokens, users),
    new RolesGuard(reflector),
  );
  registerUploads(app, uploadDir);
  await app.listen(0, "127.0.0.1");

  const server = app.getHttpServer() as unknown as Server;
  const address = server.address() as AddressInfo | null;
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  teacherToken = tokens.signAccessToken({
    id: teacher.id,
    role: Role.TEACHER,
    tokenVersion: teacher.tokenVersion,
  });
  studentToken = tokens.signAccessToken({
    id: student.id,
    role: Role.STUDENT,
    tokenVersion: student.tokenVersion,
  });
});

afterAll(async () => {
  await app?.close();
  if (uploadDir !== undefined) await rm(uploadDir, { recursive: true, force: true });
});

describe("POST /assets (integration)", () => {
  it("uploads a real image and serves it from a public UUID URL", async () => {
    const before = await fileCount();
    const response = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}` },
      body: multipart(PNG_1X1, "diagram.png", "image/png"),
    });
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      data: { mimeType: "image/png", size: PNG_1X1.length },
    });
    const url = (body as { data: { url: string } }).data.url;
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(await fileCount()).toBe(before + 1);

    const served = await fetch(`${baseUrl}${url}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG_1X1);
  });

  it("rejects a file over 5 MB with 413 and writes nothing", async () => {
    const before = await fileCount();
    const oversize = Buffer.alloc(MAX_ASSET_BYTES + 1, 0x89);
    const response = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}` },
      body: multipart(oversize, "huge.png", "image/png"),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(await fileCount()).toBe(before);
  });

  it("rejects a spoofed MIME type with 415 and writes nothing", async () => {
    const before = await fileCount();
    const response = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}` },
      body: multipart(Buffer.from("MZ\x90:\x00not-an-image"), "payload.png", "image/png"),
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(await fileCount()).toBe(before);
  });

  it("rejects a zero-byte file with 422", async () => {
    const response = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}` },
      body: multipart(Buffer.alloc(0), "empty.png", "image/png"),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a student with 403", async () => {
    const response = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${studentToken}` },
      body: multipart(PNG_1X1, "diagram.png", "image/png"),
    });
    expect(response.status).toBe(403);
  });

  it("refuses an anonymous request with 401", async () => {
    const response = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      body: multipart(PNG_1X1, "diagram.png", "image/png"),
    });
    expect(response.status).toBe(401);
  });
});

describe("GET /uploads/:filename (integration)", () => {
  it("404s names that are not a UUID plus an image extension", async () => {
    const names = ["not-a-uuid.png", `${"a".repeat(8)}-b-c-d-e.png`, `${randomUUID()}.exe`];
    for (const name of names) {
      const response = await fetch(`${baseUrl}/uploads/${name}`);
      expect(response.status, name).toBe(404);
    }
    const missing = await fetch(`${baseUrl}/uploads/${randomUUID()}.png`);
    expect(missing.status).toBe(404);
  });
});
