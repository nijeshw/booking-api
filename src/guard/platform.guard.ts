import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { AuthRequest } from './auth.guard';

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const userId = request.user?.id;
    if (!userId || !(await this.auth.isAdmin(userId))) {
      throw new ForbiddenException('You do not have access to do that');
    }
    return true;
  }
}
