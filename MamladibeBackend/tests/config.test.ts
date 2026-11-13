import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";

describe("production configuration", () => {
  it("rejects development secrets and missing production services", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://mamladibe.example",
      }),
    ).toThrow(/must be replaced in production|is required in production/);
  });
});
