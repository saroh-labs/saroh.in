// @covers accounts:/login app:/ app:/open app:/billing/invoices app:/billing/invoices/[invoiceId] app:/settings/organization app:/settings/providers app:/settings/billing site:/pay/[token] api:organizations api:invoices api:payments pkg:edition pkg:ui pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    GLOBAL_SKIP_WHY,
    globalBusiness,
    globalInvoice,
    globalStack,
    openGlobal,
    rollOut,
} from "../fixtures/global";
import { makeBusiness } from "../fixtures/own-business";
import { business } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { people } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The Global edition's screens (DEC-204), on the Global builds of the
 * merchant app and accounts (`fixtures/global.ts`). Until 6 Nov no Global
 * screen had been opened on CI; clicking through a local Global app found
 * the bugs these hold shut: the header and the data picking different
 * businesses (9d995356c), a Global bank account's save a 500 (migration
 * `20270127100000_pay_bank_shapes_by_edition`), and sign-in's legal links
 * pointing at pages saroh.tech doesn't have.
 *
 * Each test sets up a Global business of Asha's own; only the one about
 * which business opens with none chosen is `@serial`, since it depends on
 * which of her businesses is newest.
 *
 * Not here: delivery abroad at a Global merchant site's checkout. The
 * renderer is one build for both editions, and the site shop's browser
 * specs need a stack with Northwind's shop switched on (`E2E_SITE_SHOP`),
 * which CI's isn't; the API's delivery-address specs cover a country
 * outside India.
 */

const app = (path: string) => `${urls.GLOBAL_APP_URL}${path}`;

/** Nothing priced in rupees anywhere on the page. */
async function noRupee(page: Page) {
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("₹");
}

test.describe("the Global app (DEC-204)", () => {
    test.skip(!globalStack, GLOBAL_SKIP_WHY);

    test("sign-in's Privacy, Terms and Help open saroh.tech's own pages, and signing in lands on the Global app", async ({
        page,
    }) => {
        await page.goto(`${urls.GLOBAL_ACCOUNTS_URL}/login?with=password`);
        await expect(
            page.getByRole("link", { name: "Privacy", exact: true }),
        ).toHaveAttribute("href", "https://saroh.tech/legal/privacy");
        await expect(
            page.getByRole("link", { name: "Terms", exact: true }),
        ).toHaveAttribute("href", "https://saroh.tech/legal/terms");
        await expect(
            page.getByRole("link", { name: "Help", exact: true }),
        ).toHaveAttribute("href", "https://saroh.tech/help");

        await page.getByLabel("Email").fill(people.founder.email);
        await page
            .getByLabel("Password", { exact: true })
            .fill(people.founder.password);
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.waitForURL(
            (url) => url.origin === new URL(urls.GLOBAL_APP_URL).origin,
            { timeout: 30_000 },
        );
    });

    test("How to pay us asks for no UPI or IFSC, checks and saves a US account and routing number, and the invoice's page shows them as a customer sees", async ({
        page,
        context,
    }, testInfo) => {
        const b = await globalBusiness(page, testInfo, "global-pay");
        await openGlobal(page, b);
        const sheet = page.getByRole("dialog", { name: "How to pay us" });
        const row = page.locator("#business-pay-upi");

        await page.goto(app("/settings/organization?section=pay&edit=pay"));
        await expect(sheet).toBeVisible();
        await expect(sheet.getByLabel("UPI ID")).toHaveCount(0);
        await expect(sheet.getByText(/IFSC/)).toHaveCount(0);
        await expect(page.getByText("UPI ID", { exact: true })).toHaveCount(0);

        // A US business gives its account and routing number (its country's
        // own fields, checked as typed); the save that was a 500 (6 Nov).
        const field = (name: string) => sheet.getByRole("textbox", { name });
        await field("Account name").fill("Own Studio LLC");
        await field("Account number").fill("000123456789");
        // A routing number whose check digit is off is caught before saving.
        await field("Routing number").fill("021000022");
        await sheet.getByRole("button", { name: "Save" }).click();
        await expect(sheet).toContainText(
            "That routing number doesn't check out",
        );
        await field("Routing number").fill("021000021");
        await sheet.getByRole("button", { name: "Save" }).click();
        await expect(sheet).toBeHidden();
        await expect(row).toContainText("0001 2345 6789");
        await expect(row).toContainText("021000021");

        // What the customer's link shows: bank transfer, no UPI.
        const inv = await globalInvoice(page, b, testInfo);
        const { url } = await business(page.request, b.id).post<{
            url: string;
        }>(`/invoices/${inv.id}/view-link`);
        const customer = await context.newPage();
        await customer.goto(
            new URL(new URL(url).pathname, urls.RENDERER_URL).toString(),
        );
        const card = customer.getByRole("region", {
            name: `How to pay ${b.name}`,
        });
        await expect(card).toContainText("Pay by bank transfer");
        await expect(card).toContainText("Account number");
        await expect(card).toContainText("0001 2345 6789");
        await expect(card).toContainText("Routing number");
        await expect(card).toContainText("021000021");
        await expect(card).not.toContainText("UPI");
        await expect(card).not.toContainText("IFSC");
        await customer.close();
    });

    test("Providers offers Stripe alone, and its setup sheet checks each key", async ({
        page,
        browser,
    }, testInfo) => {
        const b = await globalBusiness(page, testInfo, "global-providers");
        await rollOut(browser, page, b, testInfo, [
            "MODULE_PAYMENTS",
            "STRIPE_PAYMENTS",
        ]);
        await openGlobal(page, b);
        await page.goto(app("/settings/providers"));
        await expect(
            page.getByRole("heading", { name: "Providers", level: 1 }),
        ).toBeVisible();
        const available = page.getByRole("region", { name: "Available" });
        await expect(
            available.getByText("Stripe", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Razorpay", { exact: true })).toHaveCount(
            0,
        );
        await expect(page.getByText("Cashfree", { exact: true })).toHaveCount(
            0,
        );

        const sheet = page.getByRole("dialog", { name: "Payments" });
        await pressUntil(
            page.getByRole("button", { name: "Connect Stripe" }),
            sheet,
        );
        // Razorpay's field is not asked for.
        await expect(
            sheet.getByLabel("Key secret", { exact: true }),
        ).toHaveCount(0);
        const publishable = sheet.getByLabel("Publishable key");
        const restricted = sheet.getByLabel("Restricted key");

        await restricted.fill("sk_test_example");
        await expect(sheet).toContainText(
            "Use a restricted key, not your secret key.",
        );
        await publishable.fill("not-a-key");
        await expect(sheet).toContainText(
            "That isn't a publishable key. It starts pk_live_ or pk_test_.",
        );
        await publishable.fill("pk_test_example");
        await restricted.fill("rk_live_example");
        await expect(sheet).toContainText(
            "The publishable key is a test key and the restricted key is a live key.",
        );
        await restricted.fill("rk_test_example");
        await expect(sheet).not.toContainText("restricted key is a live key");

        // Pressed with no signing secret: said there, nothing connected.
        await sheet.getByRole("button", { name: "Connect Stripe" }).click();
        await expect(sheet).toContainText(
            "Enter the webhook signing secret. It starts whsec_.",
        );
        await expect(sheet.getByRole("alert")).toContainText(
            "Check the keys marked above to connect.",
        );
        await expect(sheet).toBeVisible();
    });

    test("no Plan and billing, and no rupee on Home, invoices or settings", async ({
        page,
    }, testInfo) => {
        const b = await globalBusiness(page, testInfo, "global-money");
        const inv = await globalInvoice(page, b, testInfo);
        await openGlobal(page, b);

        await page.goto(app("/"));
        await noRupee(page);

        await page.goto(app("/billing/invoices"));
        await expect(page.getByText(inv.billedTo).first()).toBeVisible();
        await expect(page.locator("body")).toContainText("$25");
        await noRupee(page);

        await page.goto(app(`/billing/invoices/${inv.id}`));
        await expect(page.locator("body")).toContainText("$25");
        await noRupee(page);

        await page.goto(app("/settings/organization"));
        await noRupee(page);
        await expect(
            page.getByRole("link", { name: "Plan and billing" }),
        ).toHaveCount(0);

        await page.goto(app("/settings/billing"));
        await expect(
            page.getByRole("region", { name: "Your plan" }),
        ).toHaveCount(0);
    });

    test("with none chosen, a person in an India and a Global business sees the Global one's name over its own data @serial", async ({
        page,
    }, testInfo) => {
        // Global first and India last, so India is the newest of all her
        // businesses: the one the data layer fell back to before 9d995356c.
        const g = await globalBusiness(page, testInfo, "global-home");
        const inv = await globalInvoice(page, g, testInfo);
        await makeBusiness(page, testInfo, "india-home");

        // Signed in (makeBusiness), no business opened in this context.
        await page.goto(app("/billing/invoices"));
        await expect.poll(() => page.title()).toContain(g.name);
        await expect(page.getByText(inv.billedTo).first()).toBeVisible();
    });
});
