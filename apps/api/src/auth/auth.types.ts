import type { Role } from "@quiz/shared";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: Role;
  tokenVersion: number;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface OAuthAccountRecord {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: Role;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreatePasswordResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreateOAuthAccountInput {
  userId: string;
  provider: string;
  providerAccountId: string;
}

export interface CompletePasswordResetInput {
  tokenId: string;
  userId: string;
  passwordHash: string;
  at: Date;
}

export type AuthenticatedUser = Omit<UserRecord, "passwordHash">;
