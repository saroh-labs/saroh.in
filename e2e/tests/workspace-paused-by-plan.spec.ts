// @covers app:/commerce/products app:/open api:billing api:products
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The workspace after a move to a lower plan paused some products (#800):
 * the banner above every page says what is paused and links to Plan and
 * billing, and the Products list tags the oldest rows "Paused" with the
 * reason in words above the list (never only a tag or a hover), with no
 * "reached your limit" card repeating it. Read-only:
 * it opens pages and changes nothing.
 *
 * The paused state needs a business past its plan's products limit with
 * its 7 days since the notice up, which the seed doesn't make. So it runs
 * only where the stack was prepared for it and says so with
 * `E2E_PAUSED_ORG=<organization id>`: a business the demo owner owns, with
 * `PLAN_ENFORCEMENT` on, on the catalogue, more products than its plan
 * includes, and its `MOVE_DOWN` notice claim (`CustomerNotice`) dated more
 * than 7 days back. Never Rye or Pulse (read-only demo stores).
 *
 * What the API answers (`GET …/billing/paused`) is the rule; the words and
 * the cut are unit-tested in `apps/app.saroh.in/lib/billing/paused.test.ts`
 * and `apps/api.saroh.in/src/modules/billing/paused-view.spec.ts`.
 */

const ORG = process.env.E2E_PAUSED_ORG ?? "";

interface PausedRead {
    state: "paused" | "pending" | "none";
    products: { count: number };
}

async function pausedRead(page: Page): Promise<PausedRead> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${ORG}/billing/paused`,
        { headers: { origin: urls.APP_URL, "x-organization-id": ORG } },
    );
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as PausedRead;
}

test.describe("workspace: what a lower plan paused", () => {
    test.skip(!ORG, "Needs a prepared paused business (E2E_PAUSED_ORG)");

    test.beforeEach(async ({ page }) => {
        await useSession(page, "owner");
        await page.goto(`/open/${ORG}`);
    });

    test("the banner says what is paused, and the way back", async ({
        page,
    }) => {
        const read = await pausedRead(page);
        expect(read.state).toBe("paused");
        await page.goto("/");
        const banner = page
            .getByRole("status")
            .filter({ hasText: "Paused by your plan" });
        await expect(banner).toBeVisible();
        await expect(banner).toContainText(
            `${read.products.count} product${read.products.count === 1 ? "" : "s"}`,
        );
        await expect(
            banner.getByRole("link", { name: "See Plan and billing" }),
        ).toHaveAttribute("href", "/settings/billing#change-plan");
    });

    test("Products tags the paused rows and says why above them", async ({
        page,
    }) => {
        const read = await pausedRead(page);
        await page.goto("/commerce/products");
        await expect(
            page
                .getByRole("note")
                .filter({ hasText: "hidden from your site and read-only" }),
        ).toContainText(
            `${read.products.count} product${read.products.count === 1 ? " is" : "s are"} paused.`,
        );
        // At least one row on the first page is the oldest (the list is
        // newest first, so a long catalogue may need scrolling to reach
        // them); every tag is a word, not a colour.
        await expect
            .poll(() => page.getByText("Paused", { exact: true }).count())
            .toBeGreaterThan(0);
        // The note says the limit once: no "reached your limit" card under
        // it saying it again.
        await expect(page.getByText(/You've reached your/)).toHaveCount(0);
    });

    test("never sideways at the project's width", async ({ page }) => {
        await page.goto("/commerce/products");
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);
    });
});
