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

export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<UserRecord | null>;
  abstract findUserById(id: string): Promise<UserRecord | null>;
  abstract createUser(input: CreateUserInput): Promise<UserRecord>;
  abstract updateDisplayName(id: string, displayName: string): Promise<UserRecord>;
  abstract setPasswordAndInvalidateSessions(id: string, passwordHash: string): Promise<void>;
  abstract invalidateSessions(id: string): Promise<void>;

  abstract createRefreshToken(input: CreateRefreshTokenInput): Promise<void>;
  abstract findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | null>;
  abstract revokeRefreshToken(id: string, at: Date): Promise<void>;

  abstract createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void>;
  abstract findPasswordResetTokenByHash(
    hash: string,
  ): Promise<PasswordResetTokenRecord | null>;
  abstract completePasswordReset(input: CompletePasswordResetInput): Promise<void>;

  abstract findOAuthAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountRecord | null>;
  abstract createOAuthAccount(input: CreateOAuthAccountInput): Promise<void>;
}
