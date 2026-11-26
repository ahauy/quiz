import { Inject, Injectable } from "@nestjs/common";
import { AUTH_CONFIG } from "../auth.config.js";
import type { AuthConfig } from "../auth.config.js";
import { randomHex, sha256Hex } from "../utils/crypto.util.js";
import { Clock } from "../ports.js";

export interface IssuedResetToken {
  raw: string;
  hash: string;
  expiresAt: Date;
}

@Injectable()
export class ResetService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  issue(): IssuedResetToken {
    const raw = randomHex(32);
    return {
      raw,
      hash: this.hash(raw),
      expiresAt: new Date(this.clock.now().getTime() + this.config.resetTtlSeconds * 1000),
    };
  }

  hash(raw: string): string {
    return sha256Hex(raw);
  }

  buildUrl(raw: string): string {
    return `${this.config.resetUrlBase}/reset-password?token=${encodeURIComponent(raw)}`;
  }
}
