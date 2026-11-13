import { AppError } from "../lib/app-error.js";

interface TurnstileResponse {
  success: boolean;
}

export class CaptchaService {
  constructor(
    private readonly secret: string,
    private readonly bypass: boolean,
  ) {}

  async verify(token: string, remoteIp?: string) {
    if (this.bypass) return;

    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    let response: Response;
    try {
      response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AppError("SERVICE_UNAVAILABLE", "CAPTCHA verification is temporarily unavailable.");
    }
    if (!response.ok) {
      throw new AppError("SERVICE_UNAVAILABLE", "CAPTCHA verification is temporarily unavailable.");
    }
    const result = (await response.json()) as TurnstileResponse;
    if (!result.success) throw new AppError("CAPTCHA_FAILED", "CAPTCHA verification failed.");
  }
}
