import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { AUTH_CONFIG } from "../auth.config.js";
import type { AuthConfig } from "../auth.config.js";
import { authError } from "../errors.js";
import { OAuthHttpClient } from "../ports.js";
import { tokenInfoSchema, tokenResponseSchema } from "../schemas/index.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

export interface GoogleProfile {
  providerAccountId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class OAuthService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(OAuthHttpClient) private readonly http: OAuthHttpClient,
  ) {}

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: this.config.googleRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async authenticate(code: string): Promise<GoogleProfile> {
    try {
      const tokenResponse = tokenResponseSchema.parse(
        await this.http.postForm(TOKEN_ENDPOINT, this.tokenForm(code)),
      );
      const info = tokenInfoSchema.parse(
        await this.http.getJson(
          `${TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(tokenResponse.id_token)}`,
        ),
      );
      this.assertVerified(info);
      return {
        providerAccountId: info.sub,
        email: info.email,
        displayName: info.name ?? info.email,
      };
    } catch {
      throw authError("OAUTH_FAILED", "Google authentication failed");
    }
  }

  private assertVerified(
    info: z.infer<typeof tokenInfoSchema>,
  ): void {
    const verified = info.email_verified === true || info.email_verified === "true";
    if (!verified) throw new Error("Email is not verified");
    if (info.aud !== this.config.googleClientId) {
      throw new Error("Token audience mismatch");
    }
  }

  private tokenForm(code: string): Record<string, string> {
    return {
      code,
      client_id: this.config.googleClientId,
      client_secret: this.config.googleClientSecret,
      redirect_uri: this.config.googleRedirectUri,
      grant_type: "authorization_code",
    };
  }
}
