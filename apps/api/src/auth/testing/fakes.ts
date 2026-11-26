import { randomUUID } from "node:crypto";
import type { AuthConfig } from "../auth.config.js";
import { AuthRepository } from "../repositories/auth.repository.js";
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
import { Clock, OAuthHttpClient } from "../ports.js";

export function testAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    teacherCode: "TEACH-2026",
    accessSecret: "a".repeat(64),
    refreshSecret: "b".repeat(64),
    accessTtlSeconds: 900,
    refreshTtlSeconds: 604800,
    googleClientId: "client-id",
    googleClientSecret: "client-secret",
    googleRedirectUri: "http://localhost:5173/oauth/callback",
    resetUrlBase: "http://localhost:5173",
    resetTtlSeconds: 900,
    secureCookies: false,
    ...overrides,
  };
}

export class FakeClock extends Clock {
  private current: Date;

  constructor(start: Date = new Date("2026-01-01T00:00:00Z")) {
    super();
    this.current = new Date(start);
  }

  override now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakeOAuthHttpClient extends OAuthHttpClient {
  tokenResponse: unknown = { id_token: "id-token" };
  tokenInfoResponse: unknown = {
    sub: "google-sub-1",
    email: "teacher@example.com",
    email_verified: "true",
    aud: "client-id",
    name: "Teacher One",
  };
  readonly postFormCalls: Array<{ url: string; form: Record<string, string> }> = [];
  readonly getJsonCalls: string[] = [];

  override async postForm(url: string, form: Record<string, string>): Promise<unknown> {
    this.postFormCalls.push({ url, form });
    return this.tokenResponse;
  }

  override async getJson(url: string): Promise<unknown> {
    this.getJsonCalls.push(url);
    return this.tokenInfoResponse;
  }
}

export class InMemoryAuthRepository extends AuthRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly resetTokens = new Map<string, PasswordResetTokenRecord>();
  private readonly oauthAccounts = new Map<string, OAuthAccountRecord>();

  private requireUser(id: string): UserRecord {
    const user = this.users.get(id);
    if (user === undefined) throw new Error(`Missing user ${id}`);
    return user;
  }

  private invalidateInternal(id: string, at: Date): void {
    const user = this.requireUser(id);
    user.tokenVersion += 1;
    for (const token of this.refreshTokens.values()) {
      if (token.userId === id && token.revokedAt === null) token.revokedAt = at;
    }
  }

  override async findUserByEmail(email: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return { ...user };
    }
    return null;
  }

  override async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user === undefined ? null : { ...user };
  }

  override async createUser(input: CreateUserInput): Promise<UserRecord> {
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: input.role,
      tokenVersion: 0,
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  override async updateDisplayName(id: string, displayName: string): Promise<UserRecord> {
    const user = this.requireUser(id);
    user.displayName = displayName;
    return { ...user };
  }

  override async setPasswordAndInvalidateSessions(
    id: string,
    passwordHash: string,
  ): Promise<void> {
    const user = this.requireUser(id);
    user.passwordHash = passwordHash;
    this.invalidateInternal(id, new Date());
  }

  override async invalidateSessions(id: string): Promise<void> {
    this.invalidateInternal(id, new Date());
  }

  override async createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
    const id = randomUUID();
    this.refreshTokens.set(id, {
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }

  override async findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null> {
    for (const token of this.refreshTokens.values()) {
      if (token.tokenHash === hash) return { ...token };
    }
    return null;
  }

  override async revokeRefreshToken(id: string, at: Date): Promise<void> {
    const token = this.refreshTokens.get(id);
    if (token !== undefined) token.revokedAt = at;
  }

  override async createPasswordResetToken(
    input: CreatePasswordResetTokenInput,
  ): Promise<void> {
    const id = randomUUID();
    this.resetTokens.set(id, {
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    });
  }

  override async findPasswordResetTokenByHash(
    hash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    for (const token of this.resetTokens.values()) {
      if (token.tokenHash === hash) return { ...token };
    }
    return null;
  }

  override async completePasswordReset(input: CompletePasswordResetInput): Promise<void> {
    const token = this.resetTokens.get(input.tokenId);
    if (token !== undefined) token.usedAt = input.at;
    const user = this.requireUser(input.userId);
    user.passwordHash = input.passwordHash;
    this.invalidateInternal(input.userId, input.at);
  }

  override async findOAuthAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountRecord | null> {
    for (const account of this.oauthAccounts.values()) {
      if (account.provider === provider && account.providerAccountId === providerAccountId) {
        return { ...account };
      }
    }
    return null;
  }

  override async createOAuthAccount(input: CreateOAuthAccountInput): Promise<void> {
    const id = randomUUID();
    this.oauthAccounts.set(id, {
      id,
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    });
  }
}
