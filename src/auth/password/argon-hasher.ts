import { Injectable } from '@nestjs/common';
import type { PasswordHasher } from '../store/auth.store';
import { hashPassword, verifyPassword } from './password';

@Injectable()
export class ArgonHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return verifyPassword(hash, password);
  }
}
