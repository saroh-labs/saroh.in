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
