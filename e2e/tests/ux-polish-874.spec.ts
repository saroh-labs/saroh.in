// @covers accounts:/login app:/open app:/choose app:/settings/profile app:/settings/organization app:/billing/plans app:/billing/subscriptions app:/commerce/products api:organizations api:subscriptions pkg:ui
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * UX polish left from the 7 Oct audit (#874). Read-only on Northwind:
 * nothing here saves.
 *
 * - UX-079: on a phone, Settings' tabs and Settings › Business's tab strip
 *   fade on the side with more, and the open tab is scrolled into view.
 * - UX-084: /open to a business you're not in lands on /choose and says so.
 * - UX-080: a live plan's page offers Subscribe someone, which opens the
 *   dialog on that plan.
 */

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

/** The mask a strip carries, and whether its current item is in view. */
async function strip(page: Page, selector: string, current: string) {
    return page.locator(selector).evaluate((el, cur) => {
        const item = el.querySelector<HTMLElement>(cur);
        const box = el.getBoundingClientRect();
        const at = item?.getBoundingClientRect();
        return {
            overflows: el.scrollWidth > el.clientWidth + 1,
            mask:
                (el as HTMLElement).style.maskImage ||
                (el as HTMLElement).style.getPropertyValue(
                    "-webkit-mask-image",
                ),
            inView: at
                ? at.left >= box.left - 1 && at.right <= box.right + 1
                : false,
        };
    }, current);
}

test.describe("phone tab strips (UX-079)", () => {
    test.skip(({ isMobile }) => !isMobile, "Phone widths only.");

    for (const width of [320, 390]) {
        test(`Settings' tabs say there is more at ${width}px`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 800 });
            await signIn(page);
            // Activity sits late in the row: it must be scrolled to.
            await page.goto("/settings/activity");
            const got = await strip(
                page,
                'nav[aria-label="Settings"]',
                '[aria-current="page"]',
            );
            expect(got.inView).toBe(true);
            if (got.overflows) expect(got.mask).toContain("transparent");
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            ).toBe(true);
        });

        test(`Business's tab strip says there is more at ${width}px`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 800 });
            await signIn(page);
            await page.goto("/settings/organization");
            const tabs = page.getByRole("tablist", {
                name: "Business details",
            });
            await expect(tabs).toBeVisible();
            const last = tabs.getByRole("tab").last();
            await last.click();
            const got = await strip(
                page,
                '[role="tablist"][aria-label="Business details"]',
                '[aria-selected="true"]',
            );
            expect(got.inView).toBe(true);
            if (got.overflows) expect(got.mask).toContain("transparent");
        });
    }
});

test("a link to a business you're not in says so on the chooser (UX-084)", async ({
    page,
}) => {
    await useSession(page);
    await page.goto("/open/not-a-business-of-yours");
    await expect(page).toHaveURL(/\/choose\?notice=not-yours$/);
    await expect(page.getByRole("status")).toContainText(
        "That link opens a business you're not in",
    );
});

test("a live plan's page offers Subscribe someone, on that plan (UX-080)", async ({
    page,
}) => {
    await signIn(page);
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}/subscription-plans`,
        { headers: { "x-organization-id": NORTHWIND_ORG } },
    );
    expect(res.ok()).toBe(true);
    const plans = (await res.json()) as {
        id: string;
        name: string;
        status: string;
    }[];
    // A seeded plan: other tests make, change and archive their own "E2E
    // plan …" rows at the same time.
    const live = plans.find(
        (p) => p.status === "ACTIVE" && !p.name.startsWith("E2E"),
    );
    test.skip(!live, "Northwind sells no plan on this stack.");
    if (!live) return;

    await page.goto(`/billing/plans/${live.id}`);
    const subscribe = page.getByRole("link", { name: "Subscribe someone" });
    await expect(subscribe).toHaveAttribute(
        "href",
        `/billing/subscriptions?subscribe=1&plan=${live.id}`,
    );
    await subscribe.click();
    const dialog = page.getByRole("dialog", { name: "Subscribe someone" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Plan")).toContainText(live.name);
    // Closed without subscribing anyone: nothing is saved.
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/subscribe=1/);
});
