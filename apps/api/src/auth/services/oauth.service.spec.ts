import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { OAuthService } from "./oauth.service.js";
import { FakeOAuthHttpClient, testAuthConfig } from "../testing/fakes.js";

function setup() {
  const http = new FakeOAuthHttpClient();
  const oauth = new OAuthService(testAuthConfig(), http);
  return { http, oauth };
}

function captureAsync(fn: () => Promise<unknown>): Promise<unknown> {
  return fn().then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("OAuthService", () => {
  it("builds the real Google authorize URL with state and client config", () => {
    const { oauth } = setup();
    const url = new URL(oauth.buildAuthUrl("state-xyz"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  it("exchanges the code and returns a tokeninfo-verified profile", async () => {
    const { http, oauth } = setup();
    const profile = await oauth.authenticate("code-1");
    expect(profile).toEqual({
      providerAccountId: "google-sub-1",
      email: "teacher@example.com",
      displayName: "Teacher One",
    });
    expect(http.postFormCalls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(http.postFormCalls[0]?.form.code).toBe("code-1");
    expect(http.postFormCalls[0]?.form.grant_type).toBe("authorization_code");
    expect(http.getJsonCalls[0]).toContain("id_token=id-token");
  });

  it("rejects a tokeninfo response without an audience", async () => {
    const { http, oauth } = setup();
    http.tokenInfoResponse = {
      sub: "s",
      email: "u@example.com",
      email_verified: "true",
    };
    await expect(oauth.authenticate("code-1")).rejects.toMatchObject({ code: "OAUTH_FAILED" });
  });

  it("rejects an unverified email with OAUTH_FAILED", async () => {
    const { http, oauth } = setup();
    http.tokenInfoResponse = { sub: "s", email: "u@example.com", email_verified: "false", aud: "client-id" };
    expect(await captureAsync(() => oauth.authenticate("code"))).toMatchObject({
      code: "OAUTH_FAILED",
    });
  });

  it("rejects a token issued for a different audience", async () => {
    const { http, oauth } = setup();
    http.tokenInfoResponse = { sub: "s", email: "u@example.com", email_verified: "true", aud: "other-client" };
    expect(await captureAsync(() => oauth.authenticate("code"))).toMatchObject({
      code: "OAUTH_FAILED",
    });
  });

  it("rejects a token exchange with no id_token", async () => {
    const { http, oauth } = setup();
    http.tokenResponse = { error: "invalid_grant" };
    expect(await captureAsync(() => oauth.authenticate("code"))).toMatchObject({
      code: "OAUTH_FAILED",
    });
  });

  it("falls back to email for displayName when Google omits a name", async () => {
    const { http, oauth } = setup();
    http.tokenInfoResponse = { sub: "s", email: "noname@example.com", email_verified: true, aud: "client-id" };
    const profile = await oauth.authenticate("code");
    expect(profile.displayName).toBe("noname@example.com");
  });
});
