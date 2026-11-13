import { expect, test, type Page } from "@playwright/test";

const trackingId = "MD-E2E001";

async function installTurnstileStub(page: Page) {
  await page.addInitScript(() => {
    let callback: ((token: string) => void) | undefined;
    window.turnstile = {
      render: (_target, options) => {
        callback = options["callback"] as (token: string) => void;
        setTimeout(() => callback?.("e2e-turnstile-token"), 0);
        return "e2e-widget";
      },
      reset: () => setTimeout(() => callback?.("e2e-turnstile-token"), 0),
      remove: () => {},
    };
  });
}

test("switches one browser vote atomically", async ({ page }) => {
  let vote: "support" | "dispute" | null = null;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/vote") && request.method() === "POST") {
      vote = (request.postDataJSON() as { type: "support" | "dispute" }).type;
      return route.fulfill({ status: 200, json: { vote } });
    }
    if (url.pathname.endsWith("/vote") && request.method() === "DELETE") {
      vote = null;
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/comments")) {
      return route.fulfill({
        status: 200,
        json: { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } },
      });
    }
    return route.fulfill({
      status: 200,
      json: {
        incident: {
          trackingId,
          title: "E2E vote switching incident",
          description: "Deterministic browser acceptance fixture for vote switching.",
          category: "road",
          lat: 23.78,
          lng: 90.4,
          roadName: "Test Road",
          areaName: "Mohakhali",
          incidentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          support: vote === "support" ? 1 : 0,
          dispute: vote === "dispute" ? 1 : 0,
          flags: 0,
          commentCount: 0,
          isEdited: false,
          byModerator: false,
          viewerState: { vote, hasFlagged: false },
        },
      },
    });
  });

  await page.goto(`/incidents/${trackingId.toLowerCase()}`);
  const support = page.getByTestId("vote-support");
  const dispute = page.getByTestId("vote-dispute");
  await support.click();
  await expect(support).toHaveAttribute("aria-pressed", "true");
  await dispute.click();
  await expect(support).toHaveAttribute("aria-pressed", "false");
  await expect(dispute).toHaveAttribute("aria-pressed", "true");
  await dispute.click();
  await expect(dispute).toHaveAttribute("aria-pressed", "false");
});

test("rejects the sixth comment in the browser flow", async ({ page }) => {
  await installTurnstileStub(page);
  const comments: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/comments") && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        json: {
          items: comments,
          pagination: { page: 1, pageSize: 10, totalItems: comments.length, totalPages: 1 },
        },
      });
    }
    if (url.pathname.endsWith("/comments") && request.method() === "POST") {
      if (comments.length >= 5) {
        return route.fulfill({
          status: 429,
          json: {
            error: {
              code: "COMMENT_LIMIT_EXCEEDED",
              message: "The five-comment limit has been reached.",
              requestId: "req_e2e",
            },
          },
        });
      }
      const body = request.postDataJSON() as { type: string; text: string };
      const comment = {
        id: `comment-${comments.length + 1}`,
        trackingId,
        type: body.type,
        text: body.text,
        createdAt: new Date().toISOString(),
        mine: true,
        canDelete: true,
        hasFlagged: false,
      };
      comments.unshift(comment);
      return route.fulfill({
        status: 201,
        json: {
          comment,
          quota: { limit: 5, used: comments.length, remaining: 5 - comments.length },
        },
      });
    }
    return route.fulfill({
      status: 200,
      json: {
        incident: {
          trackingId,
          title: "E2E comment quota incident",
          description: "Deterministic browser acceptance fixture for comment quota.",
          category: "road",
          lat: 23.78,
          lng: 90.4,
          roadName: "Test Road",
          areaName: "Mohakhali",
          incidentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          support: 0,
          dispute: 0,
          flags: 0,
          commentCount: comments.length,
          isEdited: false,
          byModerator: false,
          viewerState: { vote: null, hasFlagged: false },
        },
      },
    });
  });

  await page.goto(`/incidents/${trackingId.toLowerCase()}`);
  const input = page.getByTestId("comment-input");
  const submit = page.getByTestId("comment-submit");
  for (let index = 1; index <= 5; index += 1) {
    await input.fill(`E2E quota comment ${index}`);
    await submit.click();
    await expect(input).toHaveValue("");
  }
  await input.fill("E2E quota comment 6");
  await submit.click();
  await expect(page.getByText("The five-comment limit has been reached.")).toBeVisible();
  expect(comments).toHaveLength(5);
});

test("surfaces the sixth incident request as rate limited", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/incidents", async (route) => {
    attempts += 1;
    if (attempts === 6) {
      return route.fulfill({
        status: 429,
        json: {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again later.",
            requestId: "req_e2e",
          },
        },
      });
    }
    return route.fulfill({
      status: 400,
      json: { error: { code: "VALIDATION_ERROR", message: "Invalid.", requestId: "req_e2e" } },
    });
  });
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const output = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch("http://127.0.0.1:3001/api/incidents", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      output.push({ status: response.status, body: await response.json() });
    }
    return output;
  });
  expect(results.slice(0, 5).every((result) => result.status === 400)).toBe(true);
  expect(results[5]).toMatchObject({ status: 429, body: { error: { code: "RATE_LIMITED" } } });
});
