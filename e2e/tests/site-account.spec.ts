// @covers site:/ site:/account site:/account/me site:/account/bookings site:/book api:site-accounts api:bookings api:sites pkg:site-blocks
import { expect, test } from "@playwright/test";

import { urls } from "../playwright.config";
import { asNewVisitor, readSiteCode, signInOnSheet } from "./site-codes";

/**
 * The customer account area on a merchant's site (round-2 plan A, A5),
 * against the running stack: the header's Sign in lands on the account's
 * Home, Me shows the customer's details and receipts, a name change sticks,
 * and signing out leaves the header's Sign in again.
 *
 * The area ships dark (`SITE_ACCOUNT_AREA`, off until A6–A8 and A13 land),
 * so these run only on a stack started with `SITE_ACCOUNT_AREA=on` in both
 * the api and saroh.app; otherwise they are skipped, and the one check that
 * runs is that `/account` is not there.
 *
 * Runs on Northwind Supply, the base seed's site. It makes a new customer
 * per test (a new email and address) and changes only that customer.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const areaOn = process.env.SITE_ACCOUNT_AREA === "on";

test.describe("the account area while it is switched off", () => {
    test.skip(areaOn, "the stack has the account area switched on");

    test("/account is not there, and the header has no Sign in", async ({
        page,
    }) => {
        const res = await page.goto(`${SITE}/account`);
        expect(res?.status()).toBe(404);
        await page.goto(SITE);
        // The header is drawn: before it is, no Sign in says nothing.
        await expect(page.getByRole("banner").first()).toBeVisible();
        await expect(
            page.getByRole("banner").getByRole("button", { name: "Sign in" }),
        ).toHaveCount(0);
    });
});

test.describe("the account area (A5)", () => {
    test.skip(!areaOn, "SITE_ACCOUNT_AREA is off on this stack");
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("Sign in in the header lands on Home, and Me keeps a name change", async ({
        page,
    }) => {
        const email = `a5-${Date.now()}@example.in`;
        await page.goto(SITE);
        await page
            .getByRole("banner")
            .getByRole("button", { name: "Sign in" })
            .click();
        await signInOnSheet(page, email);

        await expect(page).toHaveURL(/\/account$/);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi");
        const tabs = page.getByRole("navigation", { name: "Account" });
        await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute(
            "aria-current",
            "page",
        );

        await tabs.getByRole("link", { name: "Me" }).click();
        await expect(page).toHaveURL(/\/account\/me$/);
        await expect(page.getByText(email)).toBeVisible();
        await expect(page.getByText("No receipts yet.")).toBeVisible();

        await page.getByRole("button", { name: "Edit" }).click();
        const sheet = page.getByRole("dialog");
        await sheet.getByLabel("Name").fill("Asha Rao");
        await sheet.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText("Saved.")).toBeVisible();
        await page.reload();
        await expect(page.getByText("Asha Rao")).toBeVisible();

        // The account's compact header (DEC-073 #10): the tab's title and
        // the business's letter back to the site, no site header or footer.
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Me");
        await expect(page.getByRole("contentinfo")).toHaveCount(0);
        await page
            .getByRole("banner")
            .getByRole("link", { name: /^Back to the site/ })
            .click();
        await expect(page).toHaveURL(new RegExp(`^${SITE}/?$`));
        await expect(page.getByRole("contentinfo")).toBeVisible();
        await expect(
            page.getByRole("banner").getByRole("link", { name: "My account" }),
        ).toHaveText("AR");
    });

    test("changes the sign-in email with a code to the new address", async ({
        page,
    }) => {
        const email = `a5-old-${Date.now()}@example.in`;
        const next = `a5-new-${Date.now()}@example.in`;
        await page.goto(`${SITE}/account`);
        await page.getByRole("button", { name: "Sign in" }).first().click();
        await signInOnSheet(page, email);
        await page.goto(`${SITE}/account/me`);

        await page.getByRole("button", { name: "Change email" }).click();
        const sheet = page.getByRole("dialog");
        await sheet.getByLabel("New email").fill(next);
        await sheet.getByRole("button", { name: "Send code" }).click();
        const code = await readSiteCode(next);
        await sheet.getByLabel("Code").fill(code);
        await sheet.getByRole("button", { name: "Confirm new email" }).click();
        await expect(
            page.getByText(/Use that email to sign in from now on/),
        ).toBeVisible();
        await page.reload();
        await expect(page.getByText(next)).toBeVisible();
    });

    test("Bookings: a booking made signed in is moved and cancelled by the customer (A6)", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `a6-${testInfo.project.name}-${Date.now()}@example.in`;

        // Book the walkthrough, paying at the desk, signing in at the end.
        await page.goto(`${SITE}/book`);
        await page
            .getByRole("radio", { name: /Warehouse walkthrough/ })
            .click();
        const openDays = page.getByRole("radio", { name: /times? free/ });
        await expect(openDays.first()).toBeVisible({ timeout: 15_000 });
        await openDays.nth((await openDays.count()) - 1).click();
        const times = page.locator('[role="radiogroup"] button[role="radio"]', {
            hasText: /^\d{2}:\d{2}$/,
        });
        await expect(times.first()).toBeVisible({ timeout: 15_000 });
        await times.first().click();
        await page.getByLabel("Name").fill("Asha Rao");
        await page.getByRole("radio", { name: /Pay at the desk/ }).click();
        await page
            .getByRole("button", { name: "Continue to sign in" })
            .first()
            .click();
        await signInOnSheet(page, email);
        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible({ timeout: 15_000 });

        // Coming up, with Move and Cancel.
        await page.goto(`${SITE}/account/bookings`);
        const comingUp = page.getByRole("region", { name: "Coming up" });
        await expect(
            comingUp.getByText(/^Warehouse walkthrough · /),
        ).toBeVisible();

        // Move it to the first free time the sheet offers.
        await comingUp
            .getByRole("button", { name: /^Move Warehouse walkthrough/ })
            .click();
        const sheet = page.getByRole("dialog");
        const firstTime = sheet.getByRole("radio").first();
        await expect(firstTime).toBeVisible({ timeout: 15_000 });
        await firstTime.click();
        await sheet.getByRole("button", { name: /^Move to / }).click();
        await expect(page.getByText(/^Moved to /)).toBeVisible();

        // Cancel it: the sheet says what happens, then it's Cancelled.
        await comingUp
            .getByRole("button", { name: /^Cancel Warehouse walkthrough/ })
            .click();
        await expect(page.getByRole("dialog")).toContainText("Free to cancel");
        await page.getByRole("button", { name: "Yes, cancel it" }).click();
        await expect(page.getByText(/^Cancelled\./)).toBeVisible();
        await expect(
            page
                .getByRole("region", { name: "Cancelled" })
                .getByText(/^Warehouse walkthrough · /),
        ).toBeVisible();
        await expect(comingUp.getByText("Nothing booked.")).toBeVisible();
    });

    test("sign out leaves the header's Sign in", async ({ page }) => {
        const email = `a5-out-${Date.now()}@example.in`;
        await page.goto(`${SITE}/account`);
        await page.getByRole("button", { name: "Sign in" }).first().click();
        await signInOnSheet(page, email);
        await page.goto(`${SITE}/account/me`);
        await page
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
        await expect(page).toHaveURL(`${SITE}/`);
        await expect(
            page.getByRole("banner").getByRole("button", { name: "Sign in" }),
        ).toBeVisible();
    });
});
