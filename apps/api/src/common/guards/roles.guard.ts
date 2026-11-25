import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@quiz/shared";

export const ROLES_KEY = "roles";
export const Roles = (...roles: readonly Role[]) => SetMetadata(ROLES_KEY, roles);

interface RequestWithUser {
  user?: { id: string; role: Role };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) throw new UnauthorizedException();
    if (!required.includes(request.user.role)) throw new ForbiddenException();
    return true;
  }
}
