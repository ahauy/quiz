import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuthResultDto, ForgotPasswordResultDto, UserDto } from "@quiz/shared";
import { AUTH_CONFIG } from "./auth.config.js";
import type { AuthConfig } from "./auth.config.js";
import { AuthRepository } from "./repositories/auth.repository.js";
import type { UserRecord } from "./auth.types.js";
import { randomHex, timingSafeEqualBuf } from "./utils/crypto.util.js";
import type {
  ForgotPasswordDto,
  GoogleCallbackDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
} from "./dto/index.js";
import { authError } from "./errors.js";
import { OAuthService } from "./services/oauth.service.js";
import { PasswordService } from "./services/password.service.js";
import { Clock } from "./ports.js";
import { ResetService } from "./services/reset.service.js";
import { resolveRole } from "./utils/role.js";
import { TokenService } from "./services/token.service.js";

export interface AuthSession {
  result: AuthResultDto;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly oauth: OAuthService,
    private readonly reset: ResetService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  async register(dto: RegisterDto): Promise<UserDto> {
    const email = this.normalize(dto.email);
    const role = resolveRole(dto.requestedRole, dto.teacherCode, this.config.teacherCode);
    if ((await this.repo.findUserByEmail(email)) !== null) {
      throw authError("EMAIL_IN_USE", "Email is already registered");
    }
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      const user = await this.repo.createUser({
        email,
        displayName: dto.displayName,
        passwordHash,
        role,
      });
      return this.toUserDto(user);
    } catch (error) {
      // A concurrent register can win the unique-email race after the check above.
      if (this.isUniqueEmailViolation(error)) {
        throw authError("EMAIL_IN_USE", "Email is already registered");
      }
      throw error;
    }
  }

  private isUniqueEmailViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) return false;
    return (error as { code?: unknown }).code === "P2002";
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const email = this.normalize(dto.email);
    const user = await this.repo.findUserByEmail(email);
    if (user === null || user.passwordHash === null) {
      throw authError("INVALID_CREDENTIALS", "Invalid email or password");
    }
    const valid = await this.passwords.verify(dto.password, user.passwordHash);
    if (!valid) throw authError("INVALID_CREDENTIALS", "Invalid email or password");
    return this.issueSession(user);
  }

  async refresh(raw: string | undefined): Promise<AuthSession> {
    if (raw === undefined || raw.length === 0) {
      throw authError("UNAUTHORIZED", "Missing refresh token");
    }
    const now = this.clock.now();
    const record = await this.repo.findRefreshTokenByHash(this.tokens.hashRefreshToken(raw));
    if (
      record === null ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      throw authError("UNAUTHORIZED", "Invalid refresh token");
    }
    const user = await this.repo.findUserById(record.userId);
    if (user === null) throw authError("UNAUTHORIZED", "Invalid refresh token");
    await this.repo.revokeRefreshToken(record.id, now);
    return this.issueSession(user);
  }

  async logout(userId: string): Promise<void> {
    await this.repo.invalidateSessions(userId);
  }

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.repo.findUserById(userId);
    if (user === null) throw authError("UNAUTHORIZED", "Unknown user");
    return this.toUserDto(user);
  }

  async updateMe(
    userId: string,
    dto: UpdateMeDto,
  ): Promise<{ user: UserDto; passwordChanged: boolean }> {
    const user = await this.repo.findUserById(userId);
    if (user === null) throw authError("UNAUTHORIZED", "Unknown user");
    let passwordChanged = false;
    if (dto.newPassword !== undefined) {
      await this.assertCurrentPassword(user, dto.currentPassword);
      await this.repo.setPasswordAndInvalidateSessions(
        userId,
        await this.passwords.hash(dto.newPassword),
      );
      passwordChanged = true;
    }
    if (dto.displayName !== undefined) {
      await this.repo.updateDisplayName(userId, dto.displayName);
    }
    const updated = await this.repo.findUserById(userId);
    if (updated === null) throw authError("UNAUTHORIZED", "Unknown user");
    return { user: this.toUserDto(updated), passwordChanged };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<ForgotPasswordResultDto> {
    const email = this.normalize(dto.email);
    const user = await this.repo.findUserByEmail(email);
    const message = "If the account exists, a password reset link has been issued.";
    if (user === null) return { message };
    const issued = this.reset.issue();
    await this.repo.createPasswordResetToken({
      userId: user.id,
      tokenHash: issued.hash,
      expiresAt: issued.expiresAt,
    });
    const resetUrl = this.reset.buildUrl(issued.raw);
    this.logger.log(`Password reset URL for ${email}: ${resetUrl}`);
    return { message, resetUrl };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.repo.findPasswordResetTokenByHash(this.reset.hash(dto.token));
    if (record === null) throw authError("INVALID_RESET_TOKEN", "Invalid reset token");
    if (record.usedAt !== null) {
      throw authError("INVALID_RESET_TOKEN", "Reset token has already been used");
    }
    const now = this.clock.now();
    if (record.expiresAt.getTime() <= now.getTime()) {
      throw authError("EXPIRED_RESET_TOKEN", "Reset token has expired");
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.repo.completePasswordReset({
      tokenId: record.id,
      userId: record.userId,
      passwordHash,
      at: now,
    });
  }

  googleAuthUrl(): { url: string; state: string } {
    const state = randomHex(32);
    return { url: this.oauth.buildAuthUrl(state), state };
  }

  async googleCallback(
    dto: GoogleCallbackDto,
    stateCookie: string | undefined,
  ): Promise<AuthSession> {
    if (
      !timingSafeEqualBuf(Buffer.from(dto.state, "utf8"), Buffer.from(stateCookie ?? "", "utf8"))
    ) {
      throw authError("INVALID_STATE", "Invalid OAuth state");
    }
    const profile = await this.oauth.authenticate(dto.code);
    const email = this.normalize(profile.email);
    const user = await this.resolveGoogleUser(profile, email, dto.teacherCode);
    return this.issueSession(user);
  }

  private async resolveGoogleUser(
    profile: { providerAccountId: string; displayName: string },
    email: string,
    teacherCode: string | undefined,
  ): Promise<UserRecord> {
    const account = await this.repo.findOAuthAccount("google", profile.providerAccountId);
    if (account !== null) {
      const linked = await this.repo.findUserById(account.userId);
      if (linked !== null) return linked;
    }
    const existing = await this.repo.findUserByEmail(email);
    if (existing !== null) {
      await this.linkGoogle(existing.id, profile.providerAccountId);
      return existing;
    }
    const role = resolveRole(undefined, teacherCode, this.config.teacherCode);
    const created = await this.repo.createUser({
      email,
      displayName: profile.displayName,
      passwordHash: null,
      role,
    });
    await this.linkGoogle(created.id, profile.providerAccountId);
    return created;
  }

  private async linkGoogle(userId: string, providerAccountId: string): Promise<void> {
    await this.repo.createOAuthAccount({
      userId,
      provider: "google",
      providerAccountId,
    });
  }

  private async assertCurrentPassword(
    user: UserRecord,
    currentPassword: string | undefined,
  ): Promise<void> {
    if (currentPassword === undefined || user.passwordHash === null) {
      throw authError("INVALID_CREDENTIALS", "Current password is required");
    }
    const valid = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!valid) throw authError("INVALID_CREDENTIALS", "Current password is incorrect");
  }

  private async issueSession(user: UserRecord): Promise<AuthSession> {
    const accessToken = this.tokens.signAccessToken({
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    const refresh = this.tokens.generateRefreshToken();
    await this.repo.createRefreshToken({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: new Date(this.clock.now().getTime() + this.tokens.refreshTtlMs),
    });
    return {
      result: { accessToken, user: this.toUserDto(user) },
      refreshToken: refresh.raw,
    };
  }

  private toUserDto(user: UserRecord): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private normalize(email: string): string {
    return email.trim().toLowerCase();
  }
}
