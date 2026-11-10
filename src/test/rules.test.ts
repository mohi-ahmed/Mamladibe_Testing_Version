import { describe, expect, it } from "vitest";
import { RULES, changeRatio, isInBangladesh } from "@/lib/incidents";
import { addComment, castVote, flagIncident, lookupReport } from "@/lib/store";

describe("Mamladibe SRS rules (UI demo)", () => {
  it("allows 5 comments per day and rejects the sixth", () => {
    for (let i = 0; i < 5; i++) {
      expect(
        addComment({ incidentId: "md-7k3q9x", type: "extra", text: `মন্তব্য নম্বর ${i}` }).ok,
      ).toBe(true);
    }
    expect(addComment({ incidentId: "md-7k3q9x", type: "extra", text: "ষষ্ঠ মন্তব্য" }).ok).toBe(
      false,
    );
  });

  it("allows only one flag per incident", () => {
    expect(flagIncident("md-r2m8lp", "spam").ok).toBe(true);
    expect(flagIncident("md-r2m8lp", "fake").ok).toBe(false);
  });

  it("keeps one active vote and lets it switch", () => {
    castVote("md-g5t1wa", "support");
    castVote("md-g5t1wa", "dispute");
    const s = JSON.parse(window.localStorage.getItem("mamladibe:v1")!);
    expect(s.votes["md-g5t1wa"]).toBe("dispute");
  });

  it("rejects locations outside Bangladesh", () => {
    expect(isInBangladesh(23.78, 90.41)).toBe(true); // Dhaka
    expect(isInBangladesh(22.57, 88.36 - 1)).toBe(false); // west of the border
    expect(isInBangladesh(28.6, 77.2)).toBe(false); // Delhi
  });

  it("quick edit window is 15 minutes and limits changes to about 20%", () => {
    expect(RULES.quickEditMinutes).toBe(15);
    expect(changeRatio("ফার্মগেটে সংঘর্ষ হয়েছে", "ফার্মগেটে সংঘর্ষ হয়েছে।")).toBeLessThanOrEqual(
      0.2,
    );
    expect(changeRatio("ফার্মগেটে সংঘর্ষ", "সম্পূর্ণ ভিন্ন একটি লেখা")).toBeGreaterThan(0.2);
  });

  it("gives the same failure for a wrong Tracking ID or a wrong Secret", () => {
    expect(lookupReport("MD-DEMO01", "WRONG")).toBeNull();
    expect(lookupReport("MD-NOPE00", "SHAH-BAGH-2026-DEMO")).toBeNull();
    expect(lookupReport("MD-DEMO01", "SHAH-BAGH-2026-DEMO")).not.toBeNull();
  });
});
