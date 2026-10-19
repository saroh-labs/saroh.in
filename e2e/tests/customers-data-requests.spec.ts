// @covers app:/open app:/commerce/customers app:/contacts site:/account/me api:customer-workspace api:site-accounts api:contacts pkg:site-blocks
import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * Customers › Requests (DEC-172, #1107; site templates v2 plan, U14),
 * desk and phone: a new Northwind customer asks to remove their data from
 * their account, and the Northwind owner
 *
 * - sees it on the Requests tab and the list's banner, opens the customer
 *   from the request's sheet, and runs the existing removal from the
 *   customer page's banner; the request then reads Done;
 * - or closes another without removal, with the reason the dialog asks
 *   for; the customer's account then offers the button again.
 *
 * Each test makes its own customer (a new email and name, in a browser of
 * their own) and changes only them and their request. Every other
 * business, and every other Northwind customer, is untouched.
 *
 * The account area ships dark, so this runs only on a stack started with
 * `SITE_ACCOUNT_AREA=on` in both the api and saroh.app.
 */

const NORTHWIND = "seed_org";
const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;

/** A new customer signs in on Northwind's site, names themself and asks. */
async function customerAsks(
    browser: Browser,
    testInfo: TestInfo,
): Promise<{ name: string; visitor: Page; close: () => Promise<void> }> {
    const tag = stamp(testInfo);
    const name = `Asha ${tag}`;
    const context = await browser.newContext({ ignoreHTTPSErrors });
    const visitor = await context.newPage();
    await asNewVisitor(visitor);
    await visitor.goto(`${SITE}/account`);
    await visitor.getByRole("button", { name: "Sign in" }).first().click();
    await signInOnSheet(visitor, `dr-${tag}@example.com`);
    await visitor.goto(`${SITE}/account/me`);

    // A name, so the team can find them by it.
    const edit = visitor.getByRole("button", { name: "Edit" });
    const sheet = visitor.getByRole("dialog");
    await pressUntil(edit, sheet);
    await sheet.getByLabel("Name").fill(name);
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(visitor.getByText("Saved.")).toBeVisible();

    const card = visitor.getByRole("region", { name: "Your data" });
    await card.getByRole("button", { name: "Ask to remove my data" }).click();
    await visitor
        .getByRole("dialog")
        .getByRole("button", { name: "Send request" })
        .click();
    await expect(card).toContainText("Request sent.", { timeout: 15_000 });
    return { name, visitor, close: () => context.close() };
}

/** The owner on Northwind's Requests tab. */
async function openRequests(page: Page, status?: "all") {
    await useSession(page, "owner");
    await page.goto(`/open/${NORTHWIND}`);
    await page.goto(
        `/commerce/customers?tab=requests${status ? `&status=${status}` : ""}`,
    );
    await expect(
        page
            .getByRole("navigation", { name: "Customers" })
            .getByRole("link", { name: /^Requests/ }),
    ).toHaveAttribute("aria-current", "page");
}

const requestRow = (page: Page, name: string, status: string) =>
    page.getByRole("button", {
        name: `${name}, asked to remove their data, ${status}`,
    });

test.describe("Customers › Requests (U14)", () => {
    test.skip(
        process.env.SITE_ACCOUNT_AREA !== "on",
        "SITE_ACCOUNT_AREA is off on this stack",
    );

    test("the owner sees the request, runs the removal from the customer's banner, and it reads Done", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const customer = await customerAsks(browser, testInfo);
        const { name } = customer;

        // The list's banner leads to the tab.
        await useSession(page, "owner");
        await page.goto(`/open/${NORTHWIND}`);
        await page.goto("/commerce/customers");
        await expect(
            page.getByText(/customers? asked to remove their data\./),
        ).toBeVisible();

        await openRequests(page);
        const row = requestRow(page, name, "Open");
        const sheet = page.getByRole("dialog", { name: `${name}'s request` });
        await pressUntil(row, sheet);
        await expect(sheet).toContainText(
            "Receipts and invoices are kept as the law requires.",
        );
        await sheet.getByRole("link", { name: "Open customer" }).click();

        // The customer's page: the one banner, and Review removal opens the
        // existing removal preview.
        await expect(page).toHaveURL(/\/contacts\//);
        const banner = page.getByText(/^Asked to remove their data on /);
        await expect(banner).toBeVisible();
        const review = page.getByRole("button", { name: "Review removal" });
        const removal = page.getByRole("dialog", {
            name: `Remove ${name}'s details?`,
        });
        await pressUntil(review, removal);
        await removal
            .getByLabel("Type the customer's name to confirm")
            .fill(name);
        await removal.getByRole("button", { name: "Remove details" }).click();

        // Back on the Requests tab, all of them: theirs reads Done.
        await expect(page).toHaveURL(/tab=requests&status=all/, {
            timeout: 15_000,
        });
        await expect(requestRow(page, name, "Done")).toBeVisible();
        await customer.close();
    });

    test("closing without removal needs a reason, and the customer may ask again", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const customer = await customerAsks(browser, testInfo);
        const { name, visitor } = customer;

        await openRequests(page);
        const sheet = page.getByRole("dialog", { name: `${name}'s request` });
        await pressUntil(requestRow(page, name, "Open"), sheet);
        await sheet
            .getByRole("button", { name: "Close without removal…" })
            .click();
        const dialog = page.getByRole("dialog", {
            name: "Close without removing their details?",
        });
        await expect(dialog).toBeVisible();

        // No reason: refused before anything is sent.
        await dialog.getByRole("button", { name: "Close request" }).click();
        await expect(dialog).toContainText("Say why you're closing it");

        await dialog
            .getByLabel("Why are you closing it?")
            .fill(`Kept on request (${stamp(testInfo)})`);
        await dialog.getByRole("button", { name: "Close request" }).click();
        await expect(
            page.getByText("Request closed. We've emailed them."),
        ).toBeVisible({ timeout: 15_000 });
        await expect(requestRow(page, name, "Open")).toHaveCount(0);

        await openRequests(page, "all");
        await expect(requestRow(page, name, "Closed")).toBeVisible();

        // The customer: its date, and the button again. Never the reason.
        await visitor.reload();
        const card = visitor.getByRole("region", { name: "Your data" });
        await expect(card).toContainText("without removing your data");
        await expect(card).not.toContainText("Kept on request");
        await expect(
            card.getByRole("button", { name: "Ask to remove my data" }),
        ).toBeVisible();
        await customer.close();
    });
});
