// @covers site:/account/me api:site-accounts pkg:site-blocks
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * "Ask to remove my data" in the customer's account (DEC-172, #1107; site
 * templates v2 plan, U14), against the running stack, desk and phone: a
 * new Northwind customer opens Your details, confirms in the dialog (which
 * says receipts and invoices are kept as the law requires), sees "Request
 * sent", and after a reload it stays sent, with nothing to ask again.
 *
 * The account area ships dark, so this runs only on a stack started with
 * `SITE_ACCOUNT_AREA=on` in both the api and saroh.app. It makes a new
 * customer per test (a new email and address) and changes only that
 * customer: their own request, and the team alert and email it sends.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;

test.describe("Ask to remove my data (U14)", () => {
    test.skip(
        process.env.SITE_ACCOUNT_AREA !== "on",
        "SITE_ACCOUNT_AREA is off on this stack",
    );
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("a new customer sends the request, and after a reload it stays sent", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        const email = `dr-${stamp(testInfo)}@example.com`;
        await page.goto(`${SITE}/account`);
        await page.getByRole("button", { name: "Sign in" }).first().click();
        await signInOnSheet(page, email);
        await page.goto(`${SITE}/account/me`);

        const card = page.getByRole("region", { name: "Your data" });
        await expect(card).toContainText(
            "Receipts and invoices are kept as the law requires.",
        );
        const ask = card.getByRole("button", { name: "Ask to remove my data" });
        const dialog = page.getByRole("dialog", {
            name: /^Ask .+ to remove your data\?$/,
        });
        await pressUntil(ask, dialog);
        await expect(dialog).toContainText(
            "We'll email you to confirm, and again when it's done. Receipts and invoices are kept as the law requires.",
        );

        // Cancel leaves everything as it was.
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toBeHidden();
        await expect(ask).toBeFocused();
        await expect(card).not.toContainText("Request sent");

        await ask.click();
        await dialog.getByRole("button", { name: "Send request" }).click();
        await expect(dialog).toBeHidden({ timeout: 15_000 });
        await expect(card).toContainText("Request sent.");
        await expect(card).toContainText(
            /Request sent on \d{1,2} \w{3,4} \d{4}\. We've emailed you a confirmation\./,
        );
        await expect(
            card.getByRole("button", { name: "Ask to remove my data" }),
        ).toHaveCount(0);

        await page.reload();
        await expect(card).toContainText("Request sent.");
        await expect(
            card.getByRole("button", { name: "Ask to remove my data" }),
        ).toHaveCount(0);

        // On a phone the dialog and the card fit: nothing runs sideways.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);
    });
});
