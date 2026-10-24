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
 * (`ready.test.ts`, `first-steps-checklist.test.tsx`). Northwind has its
 * site, services and bookings; what is left is sharing the booking link.
 *
 * Sharing marks a moment for the whole business, once, and nothing takes
 * it back: `@serial`. The first project to run shares; the second finds the
 * 4 done, and both check what Home then shows.
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

    test("sharing the booking link ticks its step, and the money card follows", async ({
        page,
    }) => {
        const moments = () => northwind(page.request).get<Seen>("/moments");
        const shared = (await moments()).seen.includes("shared-booking-link");

        await page.goto("/");
        await expect(
            page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();

        if (!shared) {
            // Not shared yet: the 4 lead, with the share step left, and
            // none of the money steps on Home.
            const card = firstSteps(page);
            await expect(card).toBeVisible();
            await expect(card).toContainText("Finish setup");
            await expect(card).toContainText("Share your booking link");
            await expect(
                page
                    .locator('[data-setup-checklist="home"]')
                    .filter({ visible: true }),
            ).toHaveCount(0);
            await noSideways(page);

            // Meanwhile every money step is on Settings › Business.
            await page.goto("/settings/organization");
            await expect(
                page
                    .getByRole("region", { name: "Finish setup" })
                    .filter({ visible: true }),
            ).toBeVisible();

            await page.goto("/");
            const step = firstSteps(page).locator('[data-step="share"]');
            const press = step.getByRole("button", { name: "Share link" });
            const go = step.getByRole("link", { name: "Share link" });
            if ((await go.count()) > 0) {
                // Not live from Home's read: the booking page's own row.
                await go.click();
                await expect(page).toHaveURL(/\/services$/);
                await page.getByRole("button", { name: "Copy link" }).click();
            } else {
                await pressUntil(
                    press,
                    page.getByText(/Booking page link copied/),
                );
            }
            await expect
                .poll(async () =>
                    (await moments()).seen.includes("shared-booking-link"),
                )
                .toBe(true);
            await page.goto("/");
        }

        // Shared: the share step is ticked, or all 4 are and the card has
        // made way for the money card.
        await expect(
            page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        const card = firstSteps(page);
        if ((await card.count()) > 0) {
            await expect(card.locator('[data-step="share"]')).toHaveAttribute(
                "data-done",
                "",
            );
        } else {
            await expect(
                page.locator('[data-setup-checklist="home-first"]'),
            ).toHaveCount(0);
        }
        await noSideways(page);
    });
});
