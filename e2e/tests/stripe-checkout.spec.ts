// @covers app:/open app:/settings/providers site:/pay/[token] api:payments api:webhooks api:invoices api:organizations api:feature-flags api:admin pkg:site-blocks
import { createHmac } from "node:crypto";

import type { Browser, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { business, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * Stripe end to end on the business's own keys (DEC-208, U8), without
 * calling Stripe.
 *
 * The stack's API runs Stripe on its test-only fake (`STRIPE_FAKE=1`,
 * `payments/providers/stripe-fake.ts`): made-up keys connect, an intent
 * is a made-up `pi_fake_…`, and a look-up finds no payment, so only the
 * signed webhook settles one. Stripe.js is stubbed here with a fake
 * `window.Stripe` whose `confirmPayment` succeeds. The webhook is signed
 * as Stripe signs it (`t=…,v1=…`, HMAC-SHA256 over `t.body` with the
 * connection's `whsec_`) and checked by the API's real verifier.
 *
 * Each test sets up a business of its own (`makeBusiness`, as Asha): a
 * Global one (US) with Payments and the `STRIPE_PAYMENTS` release rolled
 * out to it alone by Sam, Saroh staff, or an India one. Nothing another
 * spec reads is changed, so nothing here is `@serial`.
 *
 * The merchant app on this stack is India's deployment (`NEXT_PUBLIC_EDITION`
 * unset), so the setup sheet is checked for India only; that a Global
 * business is offered Stripe alone is checked at the API, which decides it.
 */

const FAKE = process.env.STRIPE_FAKE === "1";
const SKIP_WHY =
    "Needs STRIPE_FAKE=1 on the API and the runner: the stack's Stripe fake (CI and pnpm prepush --e2e set it).";

// Made-up keys, in Stripe's shapes; the fake accepts any restricted key.
const PUBLISHABLE = "pk_test_example";
const RESTRICTED = "rk_test_example";
const SIGNING_SECRET = "whsec_example";

const headers = (b: OwnBusiness) => ({
    origin: urls.APP_URL,
    "x-organization-id": b.id,
});

/**
 * Roll each release out to this business alone, as Sam would in admin
 * (a business set up here has none), then Asha turns Payments on.
 */
async function rollOut(
    browser: Browser,
    page: Page,
    b: OwnBusiness,
    testInfo: TestInfo,
    flags: string[],
) {
    const context = await browser.newContext({ ignoreHTTPSErrors });
    try {
        const staff = await context.newPage();
        await useSession(staff, "staff");
        for (const flag of flags) {
            const res = await staff.request.put(
                `${urls.API_URL}/admin/flags/${flag}/organizations/${b.id}`,
                {
                    headers: { origin: urls.APP_URL },
                    data: {
                        enabled: true,
                        reason: "Stripe checkout browser test (U8)",
                        idempotencyKey: `u8-${flag}-${stamp(testInfo)}`,
                    },
                },
            );
            expect(res.ok(), `roll out ${flag}: ${await res.text()}`).toBe(
                true,
            );
        }
    } finally {
        await context.close();
    }
    const on = await page.request.put(
        `${urls.API_URL}/organizations/${b.id}/modules/PAYMENTS`,
        { headers: headers(b), data: { status: "ENABLED", setup: {} } },
    );
    expect(on.ok(), `turn on Payments: ${await on.text()}`).toBe(true);
}

/**
 * Stripe.js, faked: `Stripe(key)` keeps the key, the Payment Element is a
 * plain box, and `confirmPayment` answers that the intent (named by its
 * client secret, `<id>_secret_…`) succeeded.
 */
async function fakeStripeJs(page: Page) {
    await page.route("https://js.stripe.com/**", (route) =>
        route.fulfill({
            contentType: "application/javascript",
            body: `window.Stripe = function (key) {
                window.__stripeKey = key;
                var secret = "";
                return {
                    elements: function (options) {
                        secret = options.clientSecret;
                        return {
                            create: function () {
                                return {
                                    mount: function (el) { el.textContent = "Card details"; },
                                    on: function () {},
                                    focus: function () {},
                                };
                            },
                        };
                    },
                    confirmPayment: function () {
                        return Promise.resolve({
                            paymentIntent: { id: secret.split("_secret_")[0], status: "succeeded" },
                        });
                    },
                };
            };`,
        }),
    );
}

/** A `payment_intent.succeeded` event, signed as Stripe signs one. */
function signedSucceeded(
    intentId: string,
    invoiceId: string,
    amountCents: number,
    tag: string,
): { body: string; signature: string } {
    const body = JSON.stringify({
        id: `evt_fake_${tag}`,
        object: "event",
        api_version: "2026-10-28.endive",
        created: Math.floor(Date.now() / 1000),
        type: "payment_intent.succeeded",
        livemode: false,
        data: {
            object: {
                id: intentId,
                object: "payment_intent",
                amount: amountCents,
                amount_received: amountCents,
                currency: "usd",
                status: "succeeded",
                latest_charge: `ch_fake_${tag}`,
                metadata: { saroh_ref: invoiceId },
            },
        },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", SIGNING_SECRET)
        .update(`${t}.${body}`)
        .digest("hex");
    return { body, signature: `t=${t},v1=${v1}` };
}

test.describe("Stripe on the business's own keys (DEC-208)", () => {
    test.skip(!FAKE, SKIP_WHY);

    test("a Global business is offered Stripe alone, connects it, and a pay link is paid through Stripe's window and its signed webhook", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const b = await makeBusiness(page, testInfo, "stripe", {
            country: "US",
        });
        await rollOut(browser, page, b, testInfo, [
            "MODULE_PAYMENTS",
            "STRIPE_PAYMENTS",
        ]);
        const api = business(page.request, b.id);

        // Offered Stripe alone: the webhook setup lists it only, and
        // Razorpay is refused in the merchant's words.
        const setup = await api.get<{ provider: string }[]>(
            "/payment-providers/webhooks",
        );
        expect(setup.map((w) => w.provider)).toEqual(["STRIPE"]);
        const razorpay = await page.request.post(
            `${urls.API_URL}/organizations/${b.id}/payment-providers`,
            {
                headers: headers(b),
                data: {
                    provider: "RAZORPAY",
                    keyId: "rzp_test_example",
                    keySecret: "example",
                    webhookSecret: "example",
                },
            },
        );
        expect(razorpay.status()).toBe(400);
        expect(await razorpay.text()).toContain(
            "Razorpay and Cashfree take payments in India. Connect Stripe instead.",
        );

        // Invoiced payments need the business's address (DEC-068), then
        // Stripe is connected with its three made-up values.
        await api.patch("", {
            registeredAddress: {
                line1: `${s} Main Street`,
                city: "New York",
                postalCode: "10001",
            },
        });
        await api.post("/payment-providers", {
            provider: "STRIPE",
            keyId: PUBLISHABLE,
            publicKey: PUBLISHABLE,
            keySecret: RESTRICTED,
            webhookSecret: SIGNING_SECRET,
        });

        // An issued invoice of $25 and its pay link.
        const contact = await api.post<{ id: string }>("/contacts", {
            email: `u8-${s}@example.com`,
            firstName: "Jo",
            lastName: `Stripe ${s}`,
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
        await api.post(`/invoices/${draft.id}/issue`);
        const { url } = await api.post<{ url: string }>(
            `/invoices/${draft.id}/pay-link`,
        );
        const token = new URL(url).pathname.split("/").pop() ?? "";
        const status = async () => {
            const res = await page.request.get(
                `${urls.API_URL}/public/invoices/${token}`,
            );
            expect(res.ok(), await res.text()).toBe(true);
            return ((await res.json()) as { status: string }).status;
        };
        expect(await status()).toBe("ISSUED");

        await fakeStripeJs(page);
        await page.goto(`${urls.RENDERER_URL}/pay/${token}`);
        const amount = /^Pay \$25(\.00)?$/;
        const stripeWindow = page.getByRole("dialog", { name: b.name });

        // Pay opens Stripe's window: the business's name, Pay with the
        // amount, and Close, on the business's publishable key.
        await pressUntil(
            page.getByRole("button", { name: amount }),
            stripeWindow,
        );
        await expect(
            stripeWindow.getByRole("button", { name: amount }),
        ).toBeVisible();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as unknown as { __stripeKey?: string })
                            .__stripeKey,
                ),
            )
            .toBe(PUBLISHABLE);

        // Close: no payment, the window goes, and Pay is offered again.
        await stripeWindow.getByRole("button", { name: "Close" }).click();
        await expect(stripeWindow).toHaveCount(0);
        expect(await status()).toBe("ISSUED");

        // Paying: confirmPayment succeeds and the page posts the return.
        await page.getByRole("button", { name: amount }).click();
        await expect(stripeWindow).toBeVisible();
        const returned = page.waitForRequest(
            (r) =>
                r.url().endsWith("/public/payments/return") &&
                r.method() === "POST",
        );
        await stripeWindow.getByRole("button", { name: amount }).click();
        const back = (await returned).postDataJSON() as {
            provider: string;
            providerOrderId: string;
        };
        expect(back.provider).toBe("STRIPE");
        expect(back.providerOrderId).toMatch(/^pi_fake_[0-9a-f]{32}$/);
        await expect(stripeWindow).toHaveCount(0);

        // Stripe's webhook for that intent, signed with the endpoint's
        // secret: only it settles the payment on this stack.
        const event = signedSucceeded(
            back.providerOrderId,
            draft.id,
            2500,
            tag,
        );
        const hook = await page.request.post(
            `${urls.API_URL}/public/webhooks/stripe/${b.id}`,
            {
                headers: {
                    "content-type": "application/json",
                    "stripe-signature": event.signature,
                },
                data: event.body,
            },
        );
        expect(hook.status(), await hook.text()).toBe(200);

        await expect.poll(status, { timeout: 30_000 }).toBe("PAID");
        await page.reload();
        await expect(
            page.getByText("Paid", { exact: true }).first(),
        ).toBeVisible();
    });

    test("an India business is never offered Stripe in the setup sheet", async ({
        page,
        browser,
    }, testInfo) => {
        const b = await makeBusiness(page, testInfo, "stripe-in");
        await rollOut(browser, page, b, testInfo, ["MODULE_PAYMENTS"]);

        // The API refuses it, whatever a screen offered.
        const refused = await page.request.post(
            `${urls.API_URL}/organizations/${b.id}/payment-providers`,
            {
                headers: headers(b),
                data: {
                    provider: "STRIPE",
                    keyId: PUBLISHABLE,
                    publicKey: PUBLISHABLE,
                    keySecret: RESTRICTED,
                    webhookSecret: SIGNING_SECRET,
                },
            },
        );
        expect(refused.status()).toBe(400);
        expect(await refused.text()).toContain(
            "Stripe isn't available for businesses in India.",
        );

        await page.goto(`/open/${b.id}`);
        await page.goto("/settings/providers");
        await expect(
            page.getByRole("heading", { name: "Providers", level: 1 }),
        ).toBeVisible();
        const available = page.getByRole("region", { name: "Available" });
        await expect(
            available.getByText("Razorpay", { exact: true }),
        ).toBeVisible();
        await expect(
            available.getByText("Cashfree", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Stripe", { exact: true })).toHaveCount(0);

        // The sheet's provider choice holds India's two, and no Stripe field.
        const sheet = page.getByRole("dialog", { name: "Payments" });
        await pressUntil(
            page.getByRole("button", { name: "Connect Razorpay" }),
            sheet,
        );
        await expect(
            sheet.getByLabel("Key secret", { exact: true }),
        ).toBeVisible();
        await expect(sheet.getByLabel("Publishable key")).toHaveCount(0);
        await expect(sheet.getByLabel("Restricted key")).toHaveCount(0);
        await sheet.getByRole("combobox", { name: "Provider" }).click();
        await expect(page.getByRole("option")).toHaveText([
            "Razorpay",
            "Cashfree",
        ]);
    });
});
