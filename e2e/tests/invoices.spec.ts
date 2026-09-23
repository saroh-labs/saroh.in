import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * A hand-written invoice, end to end (U11): write it, issue it with its pay
 * link, open the link as the customer would, record the money, and find it
 * paid in the list's quick look.
 *
 * It runs on Northwind Supply, the base seed — not Rye & Co. or Pulse
 * Fitness, which are kept camera-ready — because an issued invoice is never
 * deleted and takes the next number in the business's series. Northwind has
 * a payment provider connected with test keys, so a pay link can be made;
 * a test cannot complete a provider's checkout, so the money arriving is
 * recorded by hand, as it is when a customer pays at the counter.
 */

const ORG = "seed_org";

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

test.describe("invoices", () => {
    test("write one by hand, issue it with a pay link, and see it paid", async ({
        page,
        context,
    }, testInfo) => {
        test.setTimeout(120_000);
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {
            origin: new URL(urls.APP_URL).origin,
        });
        await signIn(page);
        await page.goto(`/open/${ORG}`);

        // 1. Write it: who, one line, when it falls due.
        await page.goto("/billing/invoices/new");
        await expect(
            page.getByRole("heading", { name: "New invoice" }),
        ).toBeVisible();
        const issue = page.getByRole("button", {
            name: /^Issue (with pay link|it)$/,
        });
        await expect(issue).toBeDisabled();

        await page.getByRole("combobox", { name: "Who it's for" }).click();
        await page.getByRole("option").first().click();
        const what = `Catering platter (${testInfo.project.name})`;
        await page.getByLabel("Line 1: what it's for").fill(what);
        await page.getByLabel("Line 1: quantity").fill("3");
        await page.getByLabel(/^Line 1: price each/).fill("450");
        await expect(page.getByText("₹1,350").first()).toBeVisible();
        await page.getByRole("radio", { name: "In 7 days" }).click();
        await expect(
            page.getByRole("radio", { name: "In 7 days" }),
        ).toHaveAttribute("aria-checked", "true");

        // 2. Issue it: numbered, lines locked, the pay link copied.
        await expect(issue).toBeEnabled();
        await expect(issue).toHaveText("Issue with pay link");
        await issue.click();
        await page.waitForURL(/\/billing\/invoices\/(?!new)[^/?]+$/, {
            timeout: 30_000,
        });
        await expect(
            page.getByText(/issued and its pay link copied/).first(),
        ).toBeVisible();
        const number = (
            await page.getByRole("heading", { level: 1 }).innerText()
        ).trim();
        expect(number).toMatch(/\d{4}$/);
        await expect(
            page.getByText("Due", { exact: true }).first(),
        ).toBeVisible();
        await expect(page.getByText(what).first()).toBeVisible();
        // Issued: the draft's actions are gone, the unpaid ones are here.
        await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Mark paid" }),
        ).toBeVisible();

        // 3. The customer opens the link.
        const link = await page.evaluate(() => navigator.clipboard.readText());
        expect(link).toMatch(/\/pay\/[^/]+$/);
        const customer = await context.newPage();
        await customer.goto(
            new URL(new URL(link).pathname, urls.RENDERER_URL).toString(),
        );
        await expect(
            customer.getByRole("heading", { name: `Invoice ${number}` }),
        ).toBeVisible();
        await customer.close();

        // 4. The money arrives, and is recorded.
        await page.getByRole("button", { name: "Mark paid" }).click();
        const dialog = page.getByRole("dialog", { name: "Record a payment" });
        await dialog.getByRole("button", { name: "Mark it paid" }).click();
        await expect(
            page.getByText(`${number} marked paid`).first(),
        ).toBeVisible();
        await expect(
            page.getByText("Paid", { exact: true }).first(),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Copy pay link" }),
        ).toHaveCount(0);

        // 5. The list has it under Paid, and its quick look says so.
        await page.goto("/billing/invoices?view=paid");
        await expect(page.getByRole("tab", { name: /^Paid/ })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await page.getByRole("button", { name: new RegExp(number) }).click();
        const look = page.getByRole("dialog");
        await expect(look.getByText(number).first()).toBeVisible();
        await expect(look.getByText(what)).toBeVisible();
        await expect(
            look.getByRole("link", { name: "Open invoice" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(look).toHaveCount(0);
    });
});
