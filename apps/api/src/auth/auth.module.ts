import { Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { AUTH_CONFIG, createAuthConfig } from "./auth.config.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./repositories/auth.repository.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard, RolesGuard } from "./guards/index.js";
import { OAuthService } from "./services/oauth.service.js";
import { PasswordService } from "./services/password.service.js";
import { Clock, FetchOAuthHttpClient, OAuthHttpClient, SystemClock } from "./ports.js";
import { PrismaAuthRepository } from "./repositories/prisma-auth.repository.js";
import { ResetService } from "./services/reset.service.js";
import { TokenService } from "./services/token.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    OAuthService,
    ResetService,
    Reflector,
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    { provide: Clock, useClass: SystemClock },
    { provide: OAuthHttpClient, useClass: FetchOAuthHttpClient },
    { provide: AUTH_CONFIG, useFactory: createAuthConfig },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
