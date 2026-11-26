export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  override now(): Date {
    return new Date();
  }
}

export abstract class OAuthHttpClient {
  abstract postForm(url: string, form: Record<string, string>): Promise<unknown>;
  abstract getJson(url: string): Promise<unknown>;
}

export class FetchOAuthHttpClient extends OAuthHttpClient {
  override async postForm(url: string, form: Record<string, string>): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    if (!response.ok) {
      throw new Error(`Google token endpoint returned ${response.status}`);
    }
    return (await response.json()) as unknown;
  }

  override async getJson(url: string): Promise<unknown> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google tokeninfo endpoint returned ${response.status}`);
    }
    return (await response.json()) as unknown;
  }
}
