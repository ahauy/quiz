import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRepository } from "../repositories/auth.repository.js";
import type { AuthenticatedUser } from "../auth.types.js";
import { authError } from "../errors.js";
import { TokenService } from "../services/token.service.js";
import type { AccessTokenPayload } from "../services/token.service.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

interface RequestWithAuth {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly repo: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.bearerToken(request.headers.authorization);
    if (token === undefined) {
      throw authError("UNAUTHORIZED", "Authentication required");
    }
    const payload = this.verify(token);
    const user = await this.repo.findUserById(payload.sub);
    if (user === null || user.tokenVersion !== payload.tokenVersion) {
      throw authError("UNAUTHORIZED", "Session is no longer valid");
    }
    request.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private bearerToken(header: string | undefined): string | undefined {
    if (header === undefined || !header.startsWith("Bearer ")) return undefined;
    return header.slice("Bearer ".length);
  }

  private verify(token: string): AccessTokenPayload {
    try {
      return this.tokens.verifyAccessToken(token);
    } catch {
      throw authError("UNAUTHORIZED", "Invalid or expired access token");
    }
  }
}
