export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  CAPTCHA_FAILED: 400,
  FUTURE_INCIDENT_TIME: 400,
  TRACKING_CREDENTIALS_INVALID: 401,
  ADMIN_CREDENTIALS_INVALID: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF_INVALID: 403,
  ORIGIN_NOT_ALLOWED: 403,
  EDIT_WINDOW_EXPIRED: 403,
  ACTOR_BLOCKED: 403,
  NOT_FOUND: 404,
  DUPLICATE_FLAG: 409,
  DUPLICATE_INCIDENT: 409,
  CONFLICT: 409,
  ENROLMENT_EXPIRED: 410,
  OUTSIDE_BANGLADESH: 422,
  EDIT_CHANGE_TOO_LARGE: 422,
  ADMIN_ACCOUNT_LOCKED: 423,
  COMMENT_LIMIT_EXCEEDED: 429,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: {
      fieldErrors?: Record<string, string>;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}
