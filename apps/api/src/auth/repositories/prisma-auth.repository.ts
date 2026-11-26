import type { OAuthAccount, PasswordResetToken, RefreshToken, User } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import type { Role } from "@quiz/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuthRepository } from "./auth.repository.js";
import type {
  CompletePasswordResetInput,
  CreateOAuthAccountInput,
  CreatePasswordResetTokenInput,
  CreateRefreshTokenInput,
  CreateUserInput,
  OAuthAccountRecord,
  PasswordResetTokenRecord,
  RefreshTokenRecord,
  UserRecord,
} from "../auth.types.js";
import { Clock } from "../ports.js";

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  override async findUserByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row === null ? null : this.toUser(row);
  }

  override async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row === null ? null : this.toUser(row);
  }

  override async createUser(input: CreateUserInput): Promise<UserRecord> {
    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        role: input.role,
      },
    });
    return this.toUser(row);
  }

  override async updateDisplayName(id: string, displayName: string): Promise<UserRecord> {
    const row = await this.prisma.user.update({ where: { id }, data: { displayName } });
    return this.toUser(row);
  }

  override async setPasswordAndInvalidateSessions(
    id: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      }),
    ]);
  }

  override async invalidateSessions(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: this.clock.now() },
      }),
    ]);
  }

  override async createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  override async findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    return row === null ? null : this.toRefreshToken(row);
  }

  override async revokeRefreshToken(id: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: at } });
  }

  override async createPasswordResetToken(
    input: CreatePasswordResetTokenInput,
  ): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  override async findPasswordResetTokenByHash(
    hash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hash },
    });
    return row === null ? null : this.toPasswordResetToken(row);
  }

  override async completePasswordReset(input: CompletePasswordResetInput): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: input.tokenId },
        data: { usedAt: input.at },
      }),
      this.prisma.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.passwordHash,
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: input.at },
      }),
    ]);
  }

  override async findOAuthAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountRecord | null> {
    const row = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
    return row === null ? null : this.toOAuthAccount(row);
  }

  override async createOAuthAccount(input: CreateOAuthAccountInput): Promise<void> {
    await this.prisma.oAuthAccount.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    });
  }

  private toUser(row: User): UserRecord {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      passwordHash: row.passwordHash,
      role: row.role as Role,
      tokenVersion: row.tokenVersion,
    };
  }

  private toRefreshToken(row: RefreshToken): RefreshTokenRecord {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  private toPasswordResetToken(row: PasswordResetToken): PasswordResetTokenRecord {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    };
  }

  private toOAuthAccount(row: OAuthAccount): OAuthAccountRecord {
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      providerAccountId: row.providerAccountId,
    };
  }
}
