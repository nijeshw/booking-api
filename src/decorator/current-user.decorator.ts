import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../guard/auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): { id: string } => {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.user) {
      throw new Error('Current user is missing');
    }
    return request.user;
  },
);
