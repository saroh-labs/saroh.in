// @covers app:/ app:/services app:/settings/organization api:organizations api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Home's 4 first steps, then the money card (#1194, R12): publish the
 * site, add services or products, share the booking link, take the first
 * booking or order. While any is left they lead Home and the money steps
 * are on Settings › Business; once all are done the money card is back.
 *
 * On Northwind, as its owner. A business set up in the test can't turn
 * Bookings or Sell on (its modules sit behind rollout flags the stack
 * turns on for seeded businesses only, DEV_LEARNINGS), so the counting —
 * a new business's 0 of 4, samples, a shop-only business — is vitest's
 * (`ready.test.ts`, `first-steps-checklist.test.tsx`). Northwind has had
 * customers, so its link counts as shared and the 4 are done: Home shows
 * no first steps. What this checks in the browser is that, and that
 * copying the booking link marks the moment for the business.
 *
 * Copying marks a moment for the whole business, once, and nothing takes
 * it back: `@serial`.
 */

interface Seen {
    seen: string[];
}

const firstSteps = (page: Page) =>
    page.locator('[data-setup-checklist="home-first"]').filter({
        visible: true,
    });

/** Nothing on the page is wider than the width the test set. */
async function noSideways(page: Page) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() =>
            page.evaluate(() => ({
                vw: window.innerWidth,
                sw: document.documentElement.scrollWidth,
            })),
        )
        .toEqual({ vw: width, sw: width });
}

test.describe("Home's first steps (#1194)", { tag: "@serial" }, () => {
    test.beforeEach(async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {
            origin: new URL(urls.APP_URL).origin,
        });
        // The phone's share sheet can't be pressed in a test: it says sent.
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "share", {
                configurable: true,
                value: () => Promise.resolve(),
            });
        });
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("a business that has had customers sees no first steps, and copying its booking link marks the moment", async ({
        page,
    }) => {
        await page.goto("/");
        await expect(
            page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        await expect(firstSteps(page)).toHaveCount(0);
        await noSideways(page);

        await page.goto("/services");
        await pressUntil(
            page.getByRole("button", { name: "Copy link" }).first(),
            // The button says it itself: "Copied", for 1.6s.
            page.getByText("Copied", { exact: true }).first(),
        );
        await expect
            .poll(async () =>
                (
                    await northwind(page.request).get<Seen>("/moments")
                ).seen.includes("shared-booking-link"),
            )
            .toBe(true);
        await noSideways(page);
    });
});
