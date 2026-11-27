import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ValidationError } from "class-validator";
import { AppModule } from "./app.module.js";
import { registerUploads } from "./assets/static-uploads.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { authError } from "./auth/errors.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(","),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "If-Match"],
    exposedHeaders: ["ETag", "X-Exam-ETag", "X-Exam-Server-Time", "Location", "Retry-After"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
        return authError("VALIDATION_ERROR", messages.join("; ") || "Validation failed");
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const config = app.get(ConfigService);
  registerUploads(app, config.getOrThrow<string>("UPLOAD_DIR"));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
