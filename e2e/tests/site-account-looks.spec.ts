// @covers site:/account site:/account/me site:/account/bookings api:site-accounts pkg:site-blocks
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";
import {
    asNewVisitor,
    expectNoZoomOnFocus,
    lastCode,
    readSiteCode,
} from "./site-codes";

/**
 * The customer's account in each look (DEC-172, plan U12, #1104), on
 * Northwind's site, desk and phone (the `desk-serial` and `phone-serial`
 * projects). For Folio, Quiet and Live, a new customer:
 *
 * - opens `/account` and signs in on the page with a code (the stack's
 *   code outbox), the site's own header around it;
 * - lands on Home, whose one heading is the look's greeting;
 * - opens Bookings, then Details ("Your details" its page), from the
 *   look's tabs: Quiet's row at the top, Folio's bar at a phone's foot,
 *   Live's in its dock's place; each a link marked `aria-current`;
 * - finds "Ask to remove my data" on Your details (U14) and Sign out.
 *
 * On a phone there is never more than one fixed bar, and under Folio and
 * Live that one bar is the account's tabs. Nothing moves sideways.
 *
 * The account area ships dark, so this runs only on a stack started with
 * `SITE_ACCOUNT_AREA=on` in both the api and saroh.app. It makes a new
 * customer per test (a new email and address) and changes nothing of
 * theirs but signing in.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;

/** Fixed bands 40px or taller on screen, by what they are. */
function fixedBars(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
            .filter((el) => {
                if (el.closest("nextjs-portal")) return false;
                const style = getComputedStyle(el);
                if (style.position !== "fixed") return false;
                if (style.display === "none" || style.visibility === "hidden")
                    return false;
                if (el.getAttribute("aria-hidden") === "true") return false;
                const box = el.getBoundingClientRect();
                return (
                    box.height >= 40 &&
                    box.height < window.innerHeight - 1 &&
                    box.width > 0 &&
                    box.bottom > 0 &&
                    box.top < window.innerHeight
                );
            })
            .map((el) => el.getAttribute("data-site-chrome-bar") ?? el.tagName),
    );
}

function sideways(page: Page): Promise<number> {
    return page.evaluate(
        () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
    );
}

/** The account's tabs as this width shows them: one nav, never a tablist. */
function tabs(page: Page): Locator {
    // "Account pages": the footer's "Your account" column is another nav,
    // and no tab.
    return page
        .locator('nav[aria-label="Account pages"]')
        .filter({ visible: true });
}

async function holdsTheRules(page: Page, phone: boolean, look: string) {
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    if (!phone) return;
    const bars = await fixedBars(page);
    expect(bars.length).toBeLessThanOrEqual(1);
    if (look !== "quiet") expect(bars).toEqual(["account"]);
}

test.describe("the customer's account in each look", { tag: "@serial" }, () => {
    test.skip(
        process.env.SITE_ACCOUNT_AREA !== "on",
        "SITE_ACCOUNT_AREA is off on this stack",
    );
    test.beforeEach(({ page }) => asNewVisitor(page));

    for (const id of LOOKS) {
        test(`${id}: sign in with a code, then Home, Bookings and Details`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const phone = testInfo.project.name.startsWith("phone");
            const email = `account-${id}-${testInfo.project.name}-${Date.now()}@example.com`;
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                await page.goto(`${SITE}/account?v=${Date.now()}`);
                const frame = page.locator(`[data-account-look="${id}"]`);
                await expect(frame).toBeVisible({ timeout: 15_000 });

                // Signed out: the sign-in page, in the site's own header.
                await expect(page.getByRole("banner").first()).toBeVisible();
                await expect(
                    page.getByRole("heading", { level: 1, name: "Sign in" }),
                ).toBeVisible();
                await expect(tabs(page)).toHaveCount(0);
                await holdsTheRules(page, phone, "quiet");

                const emailField = frame.getByLabel("Email");
                await expectNoZoomOnFocus(emailField);
                const before = lastCode(email);
                await emailField.fill(email);
                await frame
                    .getByRole("button", { name: "Send me a code" })
                    .click();
                const code = await readSiteCode(email, before);
                const codeField = frame.getByLabel("Code");
                await expect(codeField).toHaveAttribute("inputmode", "numeric");
                await expectNoZoomOnFocus(codeField);
                await codeField.fill(code);

                // Home: the look's greeting, the tabs, Home marked.
                await expect(tabs(page)).toHaveCount(1, { timeout: 15_000 });
                await expect(
                    page.getByRole("heading", { level: 1 }),
                ).toHaveText(
                    id === "live"
                        ? "Hi there."
                        : /^Good (morning|afternoon|evening)\.$/,
                );
                await expect(
                    tabs(page).getByRole("link", { name: "Home" }),
                ).toHaveAttribute("aria-current", "page");
                await holdsTheRules(page, phone, id);

                // Bookings: Northwind books, so the tab is there.
                await tabs(page)
                    .getByRole("link", { name: "Bookings" })
                    .click();
                await expect(page).toHaveURL(/\/account\/bookings$/);
                await expect(
                    tabs(page).getByRole("link", { name: "Bookings" }),
                ).toHaveAttribute("aria-current", "page");
                await expect(
                    page.getByRole("heading", { level: 1 }),
                ).toHaveText("Bookings");
                await holdsTheRules(page, phone, id);

                // Details is the tab; Your details the page.
                await tabs(page).getByRole("link", { name: "Details" }).click();
                await expect(page).toHaveURL(/\/account\/me$/);
                await expect(
                    tabs(page).getByRole("link", { name: "Details" }),
                ).toHaveAttribute("aria-current", "page");
                await expect(
                    page.getByRole("heading", { level: 1 }),
                ).toHaveText("Your details");
                await expect(
                    page.getByText(email, { exact: true }),
                ).toBeVisible();
                // Every look keeps the data-removal request (U14).
                await expect(
                    page.getByRole("button", { name: "Ask to remove my data" }),
                ).toBeVisible();
                await expect(
                    page
                        .getByRole("button", { name: "Sign out" })
                        .filter({ visible: true })
                        .first(),
                ).toBeVisible();
                await holdsTheRules(page, phone, id);

                // The tabs' links are each 44px or more.
                for (const link of await tabs(page).getByRole("link").all()) {
                    const box = await link.boundingBox();
                    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
                }
            } finally {
                await look.restore();
            }
        });
    }
});
