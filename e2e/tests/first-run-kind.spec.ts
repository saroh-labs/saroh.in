// @covers accounts:/login app:/ app:/open app:/onboarding/modules app:/billing/invoices/new api:organizations api:capabilities api:home
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * Home's first run and `/onboarding/modules` follow what is being set up
 * (DEC-070, K3). As Asha (`founder`), on the three businesses the seed gives
 * her, one per kind, with every module rolled out and none on
 * (`packages/database/src/seed/founder.ts`). A business made in a spec
 * can't be used: the seed rolls modules out business by business, so a new
 * one has every module dark and its first run offers nothing.
 *
 * Every test only reads: the Turn on sheet is opened, never saved, and the
 * invoice link is followed to an empty form. So they run beside each other.
 */
const FIRST_RUN = {
    BUSINESS: "seed_org_first-run_business",
    SOLO: "seed_org_first-run_solo",
    WORK: "seed_org_first-run_work",
} as const;

/** Asha's business of this kind, open on Home. */
async function openFirstRun(page: Page, kind: keyof typeof FIRST_RUN) {
    await useSession(page, "founder");
    await page.goto(`/open/${FIRST_RUN[kind]}`);
    await page.goto("/");
}

/** The first-run question, and its cards in the order drawn. */
function firstRun(page: Page) {
    return page.getByRole("region", { name: "What will you do first?" });
}

async function cardTitles(page: Page): Promise<string[]> {
    const cards = firstRun(page).locator(".grid > *");
    return cards.evaluateAll((els) =>
        els.map((el) => el.querySelector("span")?.textContent ?? ""),
    );
}

test.describe("first run follows the kind (DEC-070)", () => {
    test("a site for my work starts with the website, and its card opens the Turn on sheet", async ({
        page,
    }) => {
        await openFirstRun(page, "WORK");
        await expect(firstRun(page)).toBeVisible();
        await expect
            .poll(() => cardTitles(page))
            .toEqual([
                "Put up a website",
                "Hear from readers",
                "Take bookings",
                "Sell things",
            ]);

        const website = firstRun(page)
            .getByRole("button", { name: /^Put up a website/ })
            .first();
        await expect(website).toHaveCSS("cursor", "pointer");
        // Pressed until the sheet opens: a press before hydration does
        // nothing.
        const sheet = page.getByRole("dialog", { name: "Turn on Website" });
        await expect(async () => {
            await website.click();
            await expect(sheet).toBeVisible({ timeout: 2_000 });
        }).toPass();

        // Never sideways, at the width it was set to.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);
    });

    test("a site for my work has the website suggested and ticked in the full list", async ({
        page,
    }) => {
        await openFirstRun(page, "WORK");
        await page.goto("/onboarding/modules");
        await expect(
            page.getByRole("heading", { name: "What do you need to do?" }),
        ).toBeVisible();
        await expect(
            page.getByRole("checkbox", { name: "Show up online" }),
        ).toBeChecked();
        await expect(
            page.getByRole("checkbox", { name: "Sell products" }),
        ).not.toBeChecked();
        await expect(page.getByText("Manage readers & leads")).toBeVisible();
    });

    test("just me starts with bookings, then an invoice, which opens a new one", async ({
        page,
    }) => {
        await openFirstRun(page, "SOLO");
        await expect
            .poll(() => cardTitles(page))
            .toEqual([
                "Take bookings",
                "Invoice a client",
                "Keep track of clients",
                "Put up a website",
                "Sell things",
            ]);

        // Nothing is ticked for just me.
        await page.goto("/onboarding/modules");
        await expect(
            page.getByRole("heading", { name: "What do you need to do?" }),
        ).toBeVisible();
        await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(
            0,
        );

        await page.goto("/");
        const invoice = firstRun(page).getByRole("link", {
            name: /Invoice a client/,
        });
        await expect(invoice).toHaveAttribute("href", "/billing/invoices/new");
        await invoice.click();
        await expect(page).toHaveURL(/\/billing\/invoices\/new/);
    });

    test("a business still starts with Sell, suggested and ticked", async ({
        page,
    }) => {
        await openFirstRun(page, "BUSINESS");
        await expect
            .poll(() => cardTitles(page))
            .toEqual([
                "Sell things",
                "Take bookings",
                "Put up a website",
                "Keep track of people",
            ]);
        await page.goto("/onboarding/modules");
        await expect(
            page.getByRole("checkbox", { name: "Sell products" }),
        ).toBeChecked();
    });
});
