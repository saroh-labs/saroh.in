// @covers accounts:/login app:/ app:/open app:/billing/invoices app:/billing/invoices/[invoiceId] app:/settings/organization app:/settings/providers app:/settings/billing app:/settings/billing/plans site:/pay/[token] api:organizations api:invoices api:payments api:waitlist pkg:edition pkg:ui pkg:site-blocks
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
 * pointing at pages saroh.tech doesn't have. Since 6 Nov a Global business
 * is offered no How to pay us at all (DEC-208): Stripe only.
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

    test("a Global business is offered no bank details, and its customer's invoice page shows none", async ({
        page,
        context,
    }, testInfo) => {
        // Global takes payment through Stripe only for now (owner, 6 Nov
        // 2026, DEC-208): How to pay us is off, its code kept for later.
        const b = await globalBusiness(page, testInfo, "global-pay");
        await openGlobal(page, b);

        // No tab, and a link to its sheet opens nothing.
        await page.goto(app("/settings/organization?section=pay&edit=pay"));
        await expect(page.getByRole("tab", { name: "Identity" })).toBeVisible();
        await expect(
            page.getByRole("tab", { name: "How to pay us" }),
        ).toHaveCount(0);
        await expect(
            page.getByRole("dialog", { name: "How to pay us" }),
        ).toHaveCount(0);
        await expect(page.locator("#business-pay-upi")).toHaveCount(0);

        // The API refuses a write, calmly.
        const api = business(page.request, b.id);
        const refused = await page.request.patch(
            `${urls.API_URL}/organizations/${b.id}`,
            {
                headers: api.headers,
                data: {
                    payInstructions: {
                        bankAccountName: "Own Studio LLC",
                        bankAccountNumber: "000123456789",
                    },
                },
            },
        );
        expect(refused.status()).toBe(400);
        expect(await refused.text()).toContain(
            "Bank transfer details aren't available for businesses outside India yet.",
        );

        // What the customer's link shows: no way to pay by bank transfer.
        const inv = await globalInvoice(page, b, testInfo);
        const { url } = await api.post<{ url: string }>(
            `/invoices/${inv.id}/view-link`,
        );
        const customer = await context.newPage();
        await customer.goto(
            new URL(new URL(url).pathname, urls.RENDERER_URL).toString(),
        );
        await expect(customer.locator("body")).toContainText(b.name);
        await expect(
            customer.getByRole("region", { name: `How to pay ${b.name}` }),
        ).toHaveCount(0);
        await expect(customer.locator("body")).not.toContainText(
            /[Bb]ank transfer|Account number|Routing number|IBAN|UPI|IFSC/,
        );
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

    test("Free-only: no rupee and no way to a plan on Home, invoices or settings, at the desk and on a phone", async ({
        page,
    }, testInfo) => {
        const b = await globalBusiness(page, testInfo, "global-money");
        const inv = await globalInvoice(page, b, testInfo);
        await openGlobal(page, b);

        /** No plan to buy (KTD7): no link to the plans, and no buy button. */
        async function noPlanToBuy() {
            await expect(
                page.locator('a[href^="/settings/billing/plans"]'),
            ).toHaveCount(0);
            await expect(
                page.getByRole("button", { name: /upgrade|change plan/i }),
            ).toHaveCount(0);
        }

        for (const size of [
            { width: 1440, height: 900 },
            { width: 390, height: 844 },
        ]) {
            await page.setViewportSize(size);

            await page.goto(app("/"));
            await noRupee(page);
            await noPlanToBuy();

            await page.goto(app("/billing/invoices"));
            await expect(page.getByText(inv.billedTo).first()).toBeVisible();
            await expect(page.locator("body")).toContainText("$25");
            await noRupee(page);
            await noPlanToBuy();

            await page.goto(app(`/billing/invoices/${inv.id}`));
            await expect(page.locator("body")).toContainText("$25");
            await noRupee(page);
            await noPlanToBuy();

            await page.goto(app("/settings/organization"));
            await noRupee(page);
            await noPlanToBuy();

            await page.goto(app("/settings/billing"));
            await expect(page.getByText("You're on Free")).toBeVisible();
            await expect(
                page.getByText("Paid plans aren't available yet."),
            ).toBeVisible();
            await expect(
                page.getByRole("region", { name: "Your plan" }),
            ).toHaveCount(0);
            await noRupee(page);
            await noPlanToBuy();

            // The Change plan screen isn't there.
            const plans = await page.goto(app("/settings/billing/plans"));
            expect(plans?.status()).toBe(404);
        }

        // Tell me when takes the signed-in person's address, and says so once.
        await page.goto(app("/settings/billing"));
        await page.getByRole("button", { name: "Tell me when" }).click();
        await expect(
            page.getByRole("button", { name: "We'll tell you" }),
        ).toBeDisabled();
        await expect(
            page.getByText("We'll email you when paid plans are available."),
        ).toBeVisible();
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
