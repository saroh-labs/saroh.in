// @covers accounts:/login app:/ app:/open app:/billing/invoices app:/billing/invoices/new app:/billing/invoices/[invoiceId] app:/customers app:/bookings app:/commerce/products app:/settings/organization app:/settings/providers app:/settings/billing app:/settings/billing/plans site:/pay/[token] site:/shop site:/shop/[productSlug] api:organizations api:invoices api:payments api:waitlist api:contacts api:bookings api:products api:stores api:sites api:capabilities api:feature-flags api:admin pkg:edition pkg:ui pkg:site-blocks
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    bigProduct,
    GLOBAL_SKIP_WHY,
    globalBusiness,
    globalInvoice,
    globalStack,
    openGlobal,
    rollOut,
    turnOn,
} from "../fixtures/global";
import { pressInvoiceAction } from "../fixtures/invoice-actions";
import { makeBusiness } from "../fixtures/own-business";
import { business, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { people, useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

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
 * India-only words (plan 2026-11-08-001, U13): Home, every Settings ›
 * Business tab, the details sheet Issue opens, New invoice, an invoice, a
 * customer, New booking's customer step, a product with a struck price and
 * the merchant site's shop and product page say no GST, GSTIN, ₹, +91,
 * MRP, PIN code, "Indian" or "Inclusive of all taxes", and group no figure
 * in lakhs (1,00,000). As a US business: Australia, New Zealand, Singapore
 * and Canada rightly say "GST". One India business shows its GST, ₹ and MRP
 * still, so the check can't pass by hiding them everywhere.
 *
 * Not here: delivery abroad at a Global merchant site's checkout. The
 * renderer is one build for both editions, and the site shop's browser
 * specs need a stack with Northwind's shop switched on (`E2E_SITE_SHOP`),
 * which CI's isn't; the API's delivery-address specs cover a country
 * outside India.
 */

const app = (path: string) => `${urls.GLOBAL_APP_URL}${path}`;

/**
 * India's law, money, phone and words (DEC-204 item 7), and its people as
 * a word: "Indian Ocean" and the Indian/… time zones aside.
 */
const INDIA_ONLY =
    /\bGST\b|GSTIN|₹|\+91|\bMRP\b|PIN code|Inclusive of all taxes|\blakh|\bIndian\b(?![ /]Ocean|\/)/;
/** A figure grouped in lakhs: 1,00,000. */
const LAKH_GROUPED = /\d,\d\d,\d{3}\b/;

/**
 * Nothing on the page (or in `scope`) is India's: no rupee, no GST, no +91
 * and no lakh grouping, in what is shown or in a field's example. Wait for
 * the page's own content first (`ready`): a page still loading says nothing.
 */
async function noIndia(page: Page, ready?: Locator, scope?: Locator) {
    await expect(page.locator("main").first()).toBeVisible();
    if (ready) await expect(ready).toBeVisible({ timeout: 30_000 });
    const where = scope ?? page.locator("body");
    await expect(where).not.toContainText(INDIA_ONLY, { useInnerText: true });
    await expect(where).not.toContainText(LAKH_GROUPED, {
        useInnerText: true,
    });
    await expect(
        where.locator('[placeholder*="98450"], [placeholder*="+91"]'),
    ).toHaveCount(0);
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
        // The restricted key's permissions hosted Checkout needs, and how
        // customers pay (card, with Apple Pay and Google Pay, or Link).
        await expect(sheet).toContainText(
            "create a restricted key with Checkout Sessions: Write, Customers: Write, Payment Intents: Write and Refunds: Write.",
        );
        await expect(sheet).toContainText(
            "Customers pay on Stripe's own checkout page, by card (Apple Pay and Google Pay included) or Link.",
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
            await noIndia(page);
            await noPlanToBuy();

            await page.goto(app("/billing/invoices"));
            await expect(page.getByText(inv.billedTo).first()).toBeVisible();
            await expect(page.locator("body")).toContainText("$25");
            await noIndia(page);
            await noPlanToBuy();

            await page.goto(app(`/billing/invoices/${inv.id}`));
            await expect(page.locator("body")).toContainText("$25");
            await noIndia(page);
            await noPlanToBuy();

            await page.goto(app("/settings/organization"));
            await noIndia(page);
            await noPlanToBuy();

            await page.goto(app("/settings/billing"));
            await expect(page.getByText("You're on Free")).toBeVisible();
            await expect(
                page.getByText("Paid plans aren't available yet."),
            ).toBeVisible();
            await expect(
                page.getByRole("region", { name: "Your plan" }),
            ).toHaveCount(0);
            await noIndia(page);
            await noPlanToBuy();

            // The Change plan screen isn't there. Plan and billing streams
            // (its loading screen) before the child answers, so the status is
            // 200 and the page is the app's not-found.
            await page.goto(app("/settings/billing/plans"));
            await expect(
                page.getByRole("heading", { name: "Page not found" }),
            ).toBeVisible();
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

    test("a US business's workspace says nothing India's: Home, every Business tab, invoices, a customer, New booking and a product", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(240_000);
        const b = await globalBusiness(page, testInfo, "global-words");
        await rollOut(browser, page, b, testInfo, [
            "MODULE_PAYMENTS",
            "MODULE_CRM",
            "MODULE_APPOINTMENTS",
            "MODULE_COMMERCE",
        ]);
        await turnOn(page, b, "CRM");
        await turnOn(page, b, "APPOINTMENTS", {
            hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
                weekday,
                open: "00:00",
                close: "23:30",
            })),
            service: {
                name: `Session ${stamp(testInfo)}`,
                durationMinutes: 30,
                price: "25",
            },
        });
        await turnOn(page, b, "COMMERCE");
        const inv = await globalInvoice(page, b, testInfo);
        const product = await bigProduct(page, b, testInfo);
        const s = stamp(testInfo);
        const customer = await business(page.request, b.id).post<{
            id: string;
        }>("/contacts", {
            email: `words-${s}@example.com`.toLowerCase(),
            firstName: "Sam",
            lastName: `Words ${s}`,
        });
        await openGlobal(page, b);

        await page.goto(app("/"));
        await noIndia(page, page.getByRole("heading", { level: 1 }).first());

        // Settings › Business, every tab Global draws (no How to pay us).
        for (const [section, tab] of [
            ["identity", "Identity"],
            ["contact", "Contact"],
            ["tax", "Tax and invoices"],
            ["hours", "Hours"],
            ["address", "Registered address"],
        ] as const) {
            await page.goto(app(`/settings/organization?section=${section}`));
            await expect(
                page.getByRole("tab", { name: tab, exact: true }),
            ).toHaveAttribute("aria-selected", "true");
            await noIndia(page, page.getByRole("tabpanel").first());
        }
        // The address in its country's words: its state and ZIP code.
        await expect(page.getByRole("tabpanel").first()).toContainText(
            "NY 10001",
        );

        await page.goto(app("/billing/invoices/new"));
        await noIndia(page, page.getByLabel("Line 1: what it's for"));

        await page.goto(app(`/billing/invoices/${inv.id}`));
        await expect(page.locator("body")).toContainText("$25");
        await noIndia(
            page,
            page.locator("[data-money-card]").filter({ visible: true }).first(),
        );

        await page.goto(app(`/customers/${customer.id}`));
        await noIndia(page, page.getByText(`Sam Words ${s}`).first());

        // A product with a struck price: thousands, never lakhs.
        await page.goto(app(`/commerce/products/${product.id}`));
        await noIndia(page, page.getByText(product.name).first());
        await expect(page.locator("main").first()).toContainText(/\$100,000/);
        await page.goto(app(`/commerce/products/${product.id}/edit`));
        await expect(page.locator("#pe-name")).toHaveValue(product.name);
        await noIndia(page);

        // New booking's customer step, with a new caller's phone asked.
        await page.goto(app("/bookings?new=1"));
        const sheet = page.getByRole("dialog", { name: "New booking" });
        await expect(sheet).toBeVisible();
        const caller = `Zara ${s}`;
        await sheet.getByLabel("Find the customer").fill(caller);
        await sheet
            .getByRole("button", { name: new RegExp(`Add “${caller}”`) })
            .click();
        await noIndia(page, sheet.getByLabel("Phone"), sheet);
    });

    test("Issue's business details sheet asks a US business for its state and ZIP code, never GST", async ({
        page,
    }, testInfo) => {
        // No registered address yet, so Issue asks for it (DEC-068).
        const b = await makeBusiness(page, testInfo, "global-details", {
            country: "US",
        });
        const s = stamp(testInfo);
        const api = business(page.request, b.id);
        const contact = await api.post<{ id: string }>("/contacts", {
            email: `details-${s}@example.com`.toLowerCase(),
            firstName: "Jo",
            lastName: `Details ${s}`,
        });
        const draft = await api.post<{ id: string }>("/invoices", {
            contactId: contact.id,
            currency: "USD",
            lines: [
                {
                    description: `Consultation (${s})`,
                    quantity: 1,
                    unitPrice: "25",
                },
            ],
        });
        await openGlobal(page, b);
        await page.goto(app(`/billing/invoices/${draft.id}`));
        await pressInvoiceAction(page, "Issue it");
        await page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Issue invoice" })
            .click();

        const sheet = page.getByRole("dialog", {
            name: "Add your business details",
        });
        await noIndia(page, sheet, sheet);
        await expect(sheet.getByLabel("Tax ID (optional)")).toBeVisible();
        await expect(
            sheet.getByText("ZIP code", { exact: true }).first(),
        ).toBeVisible();
        await expect(
            sheet.getByText("State", { exact: true }).first(),
        ).toBeVisible();
        await expect(
            sheet.getByRole("switch", { name: "GST-registered" }),
        ).toHaveCount(0);
    });

    test("a US business's site: its shop and a product page group thousands and say no MRP or 'Inclusive of all taxes'", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(180_000);
        const b = await globalBusiness(page, testInfo, "global-site");
        await rollOut(browser, page, b, testInfo, [
            "MODULE_PAYMENTS",
            "MODULE_COMMERCE",
            "MODULE_WEBSITE",
            "SITE_SHOP",
        ]);
        // Commerce first: the website, turned on second, sells from the
        // location Commerce made.
        await turnOn(page, b, "COMMERCE");
        await turnOn(page, b, "WEBSITE");
        const product = await bigProduct(page, b, testInfo);
        const api = business(page.request, b.id);
        const sites =
            await api.get<{ id: string; subdomain: string | null }[]>("/sites");
        const site = sites.at(0);
        expect(
            site?.subdomain,
            "Website made the business's site",
        ).toBeTruthy();
        await api.post(`/sites/${site?.id ?? ""}/publish`);
        const renderer = new URL(urls.RENDERER_URL);
        const origin = `${renderer.protocol}//${site?.subdomain ?? ""}.${renderer.host}`;
        await expect
            .poll(
                async () => (await page.request.get(`${origin}/shop`)).status(),
                { timeout: 30_000 },
            )
            .toBe(200);

        const visitor = await browser.newContext({ ignoreHTTPSErrors });
        try {
            const shop = await visitor.newPage();
            await shop.goto(`${origin}/shop`);
            const card = shop.getByRole("link", {
                name: new RegExp(product.name),
            });
            await noIndia(shop, card.first());
            await expect(card.first()).toContainText("$100,000");

            await shop.goto(`${origin}/shop/${product.slug}`);
            const lead = shop.locator("[data-price-lead]").first();
            await noIndia(shop, lead);
            await expect(lead).toContainText("$100,000");
            await expect(
                shop.locator("[data-price-mrp]").first(),
            ).toContainText("Original price");
        } finally {
            await visitor.close();
        }
    });

    test("with none chosen, a person in an India and a Global business sees the Global one's name over its own data @serial", async ({
        page,
    }, testInfo) => {
        // Not about width, and the desk and phone serial runs share the
        // signed-in person: a second run would add a second Global business.
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "runs once, at the desk",
        );
        // Global first and India last, so India is the newest of all her
        // businesses: the one the data layer fell back to before 9d995356c.
        // With none chosen she gets the first of this edition's by name
        // (listForUser), and other specs' Global businesses are hers too:
        // "global-a-…" sorts before every other "global-…" one.
        const g = await globalBusiness(page, testInfo, "global-a-home");
        const inv = await globalInvoice(page, g, testInfo);
        await makeBusiness(page, testInfo, "india-home");

        // Signed in (makeBusiness), no business opened in this context.
        await page.goto(app("/billing/invoices"));
        await expect.poll(() => page.title()).toContain(g.name);
        await expect(page.getByText(inv.billedTo).first()).toBeVisible();
    });
});

test.describe("India keeps its own words (plan 2026-11-08-001, R-I)", () => {
    test("an India business still shows GST, ₹ and MRP, with lakh grouping", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const b = await makeBusiness(page, testInfo, "india-words");
        await rollOut(browser, page, b, testInfo, [
            "MODULE_PAYMENTS",
            "MODULE_COMMERCE",
        ]);
        await turnOn(page, b, "COMMERCE");
        const product = await bigProduct(page, b, testInfo);
        const s = stamp(testInfo);
        const api = business(page.request, b.id);
        const contact = await api.post<{ id: string }>("/contacts", {
            email: `india-words-${s}@example.com`.toLowerCase(),
            firstName: "Asha",
            lastName: `Words ${s}`,
        });
        const draft = await api.post<{ id: string }>("/invoices", {
            contactId: contact.id,
            currency: "INR",
            lines: [
                {
                    description: `Birthday cake (${s})`,
                    quantity: 1,
                    unitPrice: "900",
                },
            ],
        });
        await useSession(page, "founder");
        await page.goto(`/open/${b.id}`);

        await page.goto("/settings/organization?section=tax");
        await expect(page.getByRole("tabpanel").first()).toContainText("GST");

        await page.goto(`/billing/invoices/${draft.id}`);
        await expect(
            page.locator("[data-money-card]").filter({ visible: true }).first(),
        ).toContainText("₹");

        await page.goto(`/commerce/products/${product.id}`);
        const main = page.locator("main").first();
        await expect(main).toContainText(product.name);
        await expect(main).toContainText("MRP");
        await expect(main).toContainText("₹1,00,000");
    });
});
