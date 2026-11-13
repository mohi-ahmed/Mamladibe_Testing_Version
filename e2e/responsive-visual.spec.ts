import { expect, test, type Page } from "@playwright/test";

const now = "2026-11-13T12:00:00.000Z";
const pagination = { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 };

async function mockAdmin(page: Page) {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === "/api/admin/session") {
      return route.fulfill({
        status: 200,
        json: {
          admin: { id: "admin-1", email: "admin@mamladibe.test", role: "super_admin" },
          csrfToken: "visual-test-csrf",
          session: { absoluteExpiresAt: now, idleExpiresAt: now },
        },
      });
    }
    if (pathname === "/api/admin/dashboard") {
      return route.fulfill({
        status: 200,
        json: {
          totals: { incidents: 128, comments: 346, votes: 912, openFlags: 4 },
          today: { incidents: 7, comments: 19, votes: 52, flags: 2 },
          waitingForReview: {
            incidentFlags: 3,
            commentFlags: 1,
            hiddenIncidents: 2,
            hiddenComments: 1,
          },
        },
      });
    }
    if (pathname === "/api/admin/flags") {
      return route.fulfill({
        status: 200,
        json: {
          items: [
            {
              _id: "flag-001",
              targetType: "incident",
              targetId: "MD-VISUAL1",
              reason: "misleading",
              reviewStatus: "pending",
              anonymousId: "anon-visual",
              createdAt: now,
            },
          ],
          pagination,
        },
      });
    }
    if (pathname === "/api/admin/incidents") {
      return route.fulfill({
        status: 200,
        json: {
          items: [
            {
              trackingId: "MD-VISUAL1",
              title: "Mohakhali signal crossing is blocked",
              description: "Stable visual regression fixture for responsive Admin layouts.",
              category: "road",
              lat: 23.78,
              lng: 90.4,
              roadName: "Airport Road",
              areaName: "Mohakhali",
              incidentAt: now,
              createdAt: now,
              status: "published",
              source: "public",
              anonymousId: "anon-visual",
              support: 18,
              dispute: 2,
              flags: 1,
              commentCount: 6,
              isEdited: false,
              byModerator: false,
            },
          ],
          pagination,
        },
      });
    }
    if (pathname === "/api/admin/audit") {
      return route.fulfill({
        status: 200,
        json: {
          items: [
            {
              _id: "audit-001",
              action: "incident.hide",
              adminId: { email: "admin@mamladibe.test", role: "super_admin" },
              targetType: "incident",
              targetId: "MD-VISUAL1",
              reason: "Visual regression fixture",
              createdAt: now,
            },
          ],
          pagination,
        },
      });
    }
    return route.fulfill({ status: 200, json: { items: [], pagination } });
  });
}

test.describe("responsive visual regression", () => {
  test("Admin login on a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/login");
    await expect(page).toHaveScreenshot("admin-login-mobile.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("Admin dashboard and mobile search", async ({ page }) => {
    await mockAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await page.getByRole("button", { name: "বর্তমান পেজে Search করুন" }).click();
    await expect(
      page.getByRole("textbox", { name: "Search the current admin page" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("admin-dashboard-mobile-search.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("Incident moderation uses cards on mobile", async ({ page }) => {
    await mockAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/incidents");
    await expect(page.getByText("MD-VISUAL1").first()).toBeVisible();
    await expect(page.locator("table")).toBeHidden();
    await expect(page).toHaveScreenshot("admin-incidents-mobile-cards.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("Admin dashboard on a laptop viewport", async ({ page }) => {
    await mockAdmin(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/admin");
    await expect(page.getByLabel("Search the current admin page")).toBeVisible();
    await expect(page).toHaveScreenshot("admin-dashboard-laptop.png", {
      animations: "disabled",
      fullPage: true,
    });
  });
});
