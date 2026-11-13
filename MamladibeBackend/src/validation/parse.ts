import type { output, ZodTypeAny } from "zod";

import { AppError } from "../lib/app-error.js";

export function parseInput<TSchema extends ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): output<TSchema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "request";
    fieldErrors[key] ??= issue.message;
  }
  throw new AppError("VALIDATION_ERROR", "One or more fields are invalid.", { fieldErrors });
}
