import { describe, expect, it } from "vitest";

import { changeRatio, combineEditableText, hasLink } from "../src/lib/text.js";

describe("text rules", () => {
  it("calculates the contract edit ratio over the combined fields", () => {
    const original = combineEditableText({
      title: "Large pothole",
      description: "The pothole blocks most of the left lane.",
      safetyTip: "Keep right.",
    });
    expect(changeRatio(original, original)).toBe(0);
    expect(changeRatio(original, "completely unrelated replacement")).toBeGreaterThan(0.2);
  });

  it("rejects link-like comment content", () => {
    expect(hasLink("Visit https://example.com now")).toBe(true);
    expect(hasLink("সড়কের পাশে অ্যাম্বুলেন্স এসেছে")).toBe(false);
  });
});
