import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type {
  AuthResultDto,
  AuthUrlDto,
  ForgotPasswordResultDto,
  OkDto,
  UserDto,
} from "@quiz/shared";
import type { ApiOkBody } from "../common/schemas/api-response.js";
import { AUTH_CONFIG } from "./auth.config.js";
import type { AuthConfig } from "./auth.config.js";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedUser } from "./auth.types.js";
import {
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
} from "./constants.js";
import {
  authCookieOptions,
  clearAuthCookieOptions,
  parseCookieHeader,
} from "./utils/cookies.js";
import {
  ForgotPasswordDto,
  GoogleCallbackDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
} from "./dto/index.js";
import { authError } from "./errors.js";
import { Public } from "./guards/index.js";

function currentUser(req: Request): AuthenticatedUser {
  const user = (req as Request & { user?: AuthenticatedUser }).user;
  if (user === undefined) throw authError("UNAUTHORIZED", "Authentication required");
  return user;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<ApiOkBody<UserDto>> {
    return { data: await this.auth.register(dto) };
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<AuthResultDto>> {
    const session = await this.auth.login(dto);
    this.setRefreshCookie(res, session.refreshToken);
    return { data: session.result };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<AuthResultDto>> {
    const raw = this.cookie(req, REFRESH_COOKIE_NAME);
    const session = await this.auth.refresh(raw);
    this.setRefreshCookie(res, session.refreshToken);
    return { data: session.result };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<OkDto>> {
    await this.auth.logout(currentUser(req).id);
    res.clearCookie(REFRESH_COOKIE_NAME, clearAuthCookieOptions(this.config));
    return { data: { ok: true } };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ApiOkBody<ForgotPasswordResultDto>> {
    return { data: await this.auth.forgotPassword(dto) };
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ApiOkBody<OkDto>> {
    await this.auth.resetPassword(dto);
    return { data: { ok: true } };
  }

  @Public()
  @Get("oauth/google/url")
  async googleUrl(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<AuthUrlDto>> {
    const { url, state } = this.auth.googleAuthUrl();
    res.cookie(
      OAUTH_STATE_COOKIE_NAME,
      state,
      authCookieOptions(this.config, OAUTH_STATE_TTL_SECONDS * 1000),
    );
    return { data: { url } };
  }

  @Public()
  @Post("oauth/google/callback")
  @HttpCode(HttpStatus.OK)
  async googleCallback(
    @Body() dto: GoogleCallbackDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<AuthResultDto>> {
    const stateCookie = this.cookie(req, OAUTH_STATE_COOKIE_NAME);
    const session = await this.auth.googleCallback(dto, stateCookie);
    this.setRefreshCookie(res, session.refreshToken);
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, clearAuthCookieOptions(this.config));
    return { data: session.result };
  }

  @Get("me")
  async me(@Req() req: Request): Promise<ApiOkBody<UserDto>> {
    return { data: await this.auth.getMe(currentUser(req).id) };
  }

  @Patch("me")
  async updateMe(
    @Req() req: Request,
    @Body() dto: UpdateMeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOkBody<UserDto>> {
    const { user, passwordChanged } = await this.auth.updateMe(currentUser(req).id, dto);
    if (passwordChanged) {
      res.clearCookie(REFRESH_COOKIE_NAME, clearAuthCookieOptions(this.config));
    }
    return { data: user };
  }

  private setRefreshCookie(res: Response, raw: string): void {
    res.cookie(
      REFRESH_COOKIE_NAME,
      raw,
      authCookieOptions(this.config, this.config.refreshTtlSeconds * 1000),
    );
  }

  private cookie(req: Request, name: string): string | undefined {
    return parseCookieHeader(req.headers.cookie)[name];
  }
}
