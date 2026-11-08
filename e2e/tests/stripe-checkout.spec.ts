// @covers app:/open app:/settings/providers site:/pay/[token] site:/pay/o/[token] site:/pay/paid site:/paid site:/book api:payments api:webhooks api:invoices api:orders api:stores api:products api:bookings api:site-accounts api:sites api:capabilities api:organizations api:feature-flags api:admin pkg:site-blocks
import { createHmac } from "node:crypto";

import type { Browser, Page, Request, Route, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { rollOut } from "../fixtures/global";
import type { OwnBusiness } from "../fixtures/own-business";
import { makeBusiness } from "../fixtures/own-business";
import { business, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { urls } from "../playwright.config";
import { asNewVisitor, nameThenBook, signInOnSheet } from "./site-codes";

/**
 * Stripe end to end on the business's own keys, through Stripe's hosted
 * Checkout (DEC-208 and its 7 Nov amendment; plan 2026-11-07-002, U10),
 * without calling Stripe.
 *
 * The stack's API runs Stripe on its test-only fake (`STRIPE_FAKE=1`,
 * `payments/providers/stripe-fake.ts`): made-up keys connect, a payment is
 * a made-up Checkout Session `cs_fake_…` whose address is on
 * checkout.stripe.com and carries the session's success and cancel
 * addresses as query parameters, and a look-up finds no payment, so only
 * the signed webhook settles one. Stripe's page is stood in for here
 * (`stubCheckout`): Pay follows the success address, Back the cancel one,
 * as Stripe's own page would send the customer. Each webhook is signed as
 * Stripe signs it (`t=…,v1=…`, HMAC-SHA256 over `t.body` with the
 * connection's `whsec_`) and checked by the API's real verifier.
 *
 * Each test sets up a business of its own (`makeBusiness`, as Asha): a
 * Global one (US) with the releases it needs rolled out to it alone by Sam,
 * Saroh staff, or an India one. The booking tests publish that business's
 * own booking page and book on it as a new customer with a stamped email.
 * Nothing another spec reads is changed, so nothing here is `@serial`.
 *
 * The setup sheet is checked here on India's app (`urls.APP_URL`); the
 * Global app's sheet, Stripe alone and its key checks, is
 * `global-screens.spec.ts`.
 */

const FAKE = process.env.STRIPE_FAKE === "1";
const SKIP_WHY =
    "Needs STRIPE_FAKE=1 on the API and the runner: the stack's Stripe fake (CI and pnpm prepush --e2e set it).";

// Made-up keys, in Stripe's shapes; the fake accepts any restricted key.
const PUBLISHABLE = "pk_test_example";
const RESTRICTED = "rk_test_example";
const SIGNING_SECRET = "whsec_example";

const CHECKOUT_ORIGIN = "https://checkout.stripe.com/";
const CHECKOUT = /^https:\/\/checkout\.stripe\.com\//;

const headers = (b: OwnBusiness) => ({
    origin: urls.APP_URL,
    "x-organization-id": b.id,
});

/** What the fake's Checkout address says about its session. */
interface Session {
    sessionId: string;
    /** Saroh's intent id, which the cancel address carries (and Stripe echoes as `client_reference_id`). */
    intentId: string;
    successUrl: string;
    cancelUrl: string;
}

function sessionOf(checkoutUrl: string): Session {
    const url = new URL(checkoutUrl);
    const sessionId = url.pathname.split("/").pop() ?? "";
    const success = url.searchParams.get("success_url") ?? "";
    const cancelUrl = url.searchParams.get("cancel_url") ?? "";
    expect(sessionId).toMatch(/^cs_fake_[0-9a-f]{32}$/);
    expect(success).toContain("session_id={CHECKOUT_SESSION_ID}");
    const intentId = new URL(cancelUrl).searchParams.get("intent") ?? "";
    expect(intentId, "the cancel address names Saroh's intent").toBeTruthy();
    return {
        sessionId,
        intentId,
        // Stripe fills the session id in on its way back.
        successUrl: success.replace("{CHECKOUT_SESSION_ID}", sessionId),
        cancelUrl,
    };
}

const attr = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Stripe's hosted Checkout page, stood in for: a Pay link to the session's
 * success address and a Back link to its cancel address. Nothing else on
 * checkout.stripe.com is loaded.
 */
async function stubCheckout(page: Page): Promise<void> {
    await page.route("https://checkout.stripe.com/**", (route: Route) => {
        const s = sessionOf(route.request().url());
        return route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html><head><title>Checkout</title></head><body>
                <h1>Stripe Checkout (stub)</h1>
                <a href="${attr(s.successUrl)}">Pay</a>
                <a href="${attr(s.cancelUrl)}">Back</a>
            </body></html>`,
        });
    });
}

/** Sign a webhook body as Stripe does, with the endpoint's secret. */
function signed(body: unknown): { body: string; signature: string } {
    const text = JSON.stringify(body);
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", SIGNING_SECRET)
        .update(`${t}.${text}`)
        .digest("hex");
    return { body: text, signature: `t=${t},v1=${v1}` };
}

function event(type: string, tag: string, object: Record<string, unknown>) {
    return {
        id: `evt_fake_${type.replace(/\W/g, "_")}_${tag}`,
        object: "event",
        api_version: "2026-10-28.endive",
        created: Math.floor(Date.now() / 1000),
        type,
        livemode: false,
        data: { object },
    };
}

/** `checkout.session.completed` (paid) or `checkout.session.expired`, as Stripe sends them. */
function sessionEvent(
    type: "checkout.session.completed" | "checkout.session.expired",
    s: Session,
    amountCents: number,
    tag: string,
    ref?: string,
) {
    const paid = type === "checkout.session.completed";
    return event(type, tag, {
        id: s.sessionId,
        object: "checkout.session",
        amount_total: amountCents,
        currency: "usd",
        client_reference_id: s.intentId,
        metadata: {
            saroh_intent: s.intentId,
            ...(ref ? { saroh_ref: ref } : {}),
        },
        mode: "payment",
        payment_intent: paid ? `pi_fake_${tag}` : null,
        payment_status: paid ? "paid" : "unpaid",
        status: paid ? "complete" : "expired",
    });
}

/**
 * `payment_intent.succeeded` alone, as an endpoint made before hosted
 * Checkout gets it (no session events, KTD-6): the PaymentIntent carries
 * Saroh's intent id, so it settles the session's payment by itself.
 */
function intentSucceeded(
    s: Session,
    ref: string,
    amountCents: number,
    tag: string,
) {
    return event("payment_intent.succeeded", tag, {
        id: `pi_fake_${tag}`,
        object: "payment_intent",
        amount: amountCents,
        amount_received: amountCents,
        currency: "usd",
        status: "succeeded",
        latest_charge: `ch_fake_${tag}`,
        metadata: { saroh_ref: ref, saroh_intent: s.intentId },
    });
}

async function sendWebhook(page: Page, b: OwnBusiness, body: unknown) {
    const hook = signed(body);
    const res = await page.request.post(
        `${urls.API_URL}/public/webhooks/stripe/${b.id}`,
        {
            headers: {
                "content-type": "application/json",
                "stripe-signature": hook.signature,
            },
            data: hook.body,
        },
    );
    expect(res.status(), await res.text()).toBe(200);
}

/** The buyer's view of a session, as the `/paid` page reads it. */
interface SessionView {
    status: string;
    kind: string;
    amountCents: number;
    booking: { startAt: string } | null;
}

async function readSession(page: Page, sessionId: string) {
    const res = await page.request.get(
        `${urls.API_URL}/public/payments/checkout/${sessionId}`,
    );
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as SessionView;
}

/** The page's heading, wherever the business's look puts it. */
const heading = (page: Page, name: string) =>
    page.getByRole("heading", { name, level: 1 });

/**
 * A Global business (US) whose payments go through Stripe: Payments and
 * `STRIPE_PAYMENTS` rolled out to it alone, its address set (DEC-068), and
 * Stripe connected with three made-up values. `extra` rolls out more.
 */
async function stripeBusiness(
    page: Page,
    browser: Browser,
    testInfo: TestInfo,
    prefix: string,
    extra: string[] = [],
): Promise<OwnBusiness> {
    const b = await makeBusiness(page, testInfo, prefix, { country: "US" });
    await rollOut(browser, page, b, testInfo, [
        "MODULE_PAYMENTS",
        "STRIPE_PAYMENTS",
        ...extra,
    ]);
    const api = business(page.request, b.id);
    await api.patch("", {
        registeredAddress: {
            line1: `${stamp(testInfo)} Main Street`,
            city: "New York",
            region: "NY",
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
    return b;
}

/** Turn a module on with its setup, as the Turn on sheet does. */
async function turnOn(page: Page, b: OwnBusiness, key: string, setup: object) {
    const res = await page.request.put(
        `${urls.API_URL}/organizations/${b.id}/modules/${key}`,
        { headers: headers(b), data: { status: "ENABLED", setup } },
    );
    expect(res.ok(), `turn on ${key}: ${await res.text()}`).toBe(true);
}

/**
 * A Stripe business with a live booking page (DEC-175) and one $25 service
 * open every day, so a time is always free: its site's address and the
 * service's id.
 */
async function stripeBookingSite(
    page: Page,
    browser: Browser,
    testInfo: TestInfo,
    prefix: string,
): Promise<{ b: OwnBusiness; site: string; serviceId: string }> {
    const b = await stripeBusiness(page, browser, testInfo, prefix, [
        "MODULE_CRM",
        "MODULE_APPOINTMENTS",
        "MODULE_WEBSITE",
    ]);
    await turnOn(page, b, "CRM", {});
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
    const api = business(page.request, b.id);
    const services = await api.get<{ id: string }[]>("/services");
    const serviceId = services.at(0)?.id ?? "";
    expect(serviceId, "the setup made its service").toBeTruthy();
    await api.post("/booking-page/publish");
    const renderer = new URL(urls.RENDERER_URL);
    const site = `${renderer.protocol}//${b.address}.${renderer.host}`;
    await expect
        .poll(async () => (await page.request.get(`${site}/book`)).status(), {
            timeout: 20_000,
        })
        .toBe(200);
    return { b, site, serviceId };
}

/**
 * As a new customer on the business's booking page: the first free time,
 * Pay now, sign in with a code, and press Pay. The page leaves for Stripe's
 * (stubbed) Checkout; answers the hold's pay token and the session.
 */
async function bookAndLeaveForStripe(
    customer: Page,
    site: string,
    serviceId: string,
    email: string,
): Promise<{ payToken: string; session: Session }> {
    await customer.goto(`${site}/book?service=${serviceId}`);
    const days = customer.getByRole("radio", { name: /times? free/ });
    await expect(days.first()).toBeVisible({ timeout: 15_000 });
    await days.first().click();
    const times = customer.locator('[role="radiogroup"] button[role="radio"]', {
        hasText: /^\d{1,2}:\d{2} [ap]m$/,
    });
    await expect(times.first()).toBeVisible({ timeout: 15_000 });
    await times.first().click();

    const payNow = customer.getByRole("radio", { name: /^Pay \$\S+ now/ });
    await payNow.click();
    await expect(payNow).toHaveAttribute("aria-checked", "true");

    const intent = customer.waitForRequest((r: Request) =>
        r.url().includes("/payment-intent"),
    );
    await customer
        .getByRole("button", { name: "Continue to sign in" })
        .first()
        .click();
    await signInOnSheet(customer, email);
    await nameThenBook(customer, "Jo Rivera");
    const payToken = new URL((await intent).url()).pathname.split("/")[3] ?? "";
    expect(payToken).toBeTruthy();
    await customer.waitForURL(CHECKOUT, { timeout: 30_000 });
    return { payToken, session: sessionOf(customer.url()) };
}

test.describe("Stripe on the business's own keys, through hosted Checkout (DEC-208)", () => {
    test.skip(!FAKE, SKIP_WHY);

    test("a Global business is offered Stripe alone, and a pay link is paid on Stripe's page and settled by the PaymentIntent's webhook alone", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const b = await stripeBusiness(page, browser, testInfo, "stripe");
        const api = business(page.request, b.id);

        // Offered Stripe alone: the webhook setup lists it only, with the
        // Checkout events, and Razorpay is refused in the merchant's words.
        const setup = await api.get<{ provider: string; events: string[] }[]>(
            "/payment-providers/webhooks",
        );
        expect(setup.map((w) => w.provider)).toEqual(["STRIPE"]);
        expect(setup[0]?.events).toContain("checkout.session.completed");
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

        // An issued invoice of $25 and its pay link.
        const contact = await api.post<{ id: string }>("/contacts", {
            email: `u10-${s}@example.com`.toLowerCase(),
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

        // Pay leaves for Stripe's page: no Stripe script, no window.
        const scripts: string[] = [];
        page.on("request", (r) => {
            if (r.url().startsWith("https://js.stripe.com/")) {
                scripts.push(r.url());
            }
        });
        await stubCheckout(page);
        await page.goto(`${urls.RENDERER_URL}/pay/${token}`);
        await pressUntil(
            page.getByRole("button", { name: /^Pay \$25(\.00)?$/ }),
            () => Promise.resolve(page.url().startsWith(CHECKOUT_ORIGIN)),
        );
        await page.waitForURL(CHECKOUT);
        const session = sessionOf(page.url());
        expect(scripts).toEqual([]);

        // Paid on Stripe's page: back on the business's /paid, confirming
        // until the webhook lands.
        await page.getByRole("link", { name: "Pay" }).click();
        await page.waitForURL(/\/paid\?session_id=cs_fake_/);
        await expect(heading(page, "Confirming your payment")).toBeVisible();
        expect(await status()).toBe("ISSUED");

        // An endpoint from before hosted Checkout sends only
        // payment_intent.succeeded; Saroh's id on it settles the payment.
        await sendWebhook(
            page,
            b,
            intentSucceeded(session, draft.id, 2500, tag),
        );
        await expect.poll(status, { timeout: 30_000 }).toBe("PAID");
        await expect(heading(page, "Payment received")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByText(/has your payment of \$25(\.00)?\./),
        ).toBeVisible();
    });

    test("an order's pay link is paid on Stripe's page, and the session's webhook says Payment received", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const b = await stripeBusiness(page, browser, testInfo, "stripe-o", [
            "MODULE_COMMERCE",
        ]);
        await turnOn(page, b, "COMMERCE", {});
        const api = business(page.request, b.id);

        // The storefront the setup made, a product, and an order for a
        // new customer, by email.
        const listed = await page.request.get(`${urls.API_URL}/stores`);
        expect(listed.ok(), await listed.text()).toBe(true);
        const stores = (await listed.json()) as {
            id: string;
            organizationId: string;
        }[];
        const store = stores.find((x) => x.organizationId === b.id);
        expect(store, "Commerce made the business's storefront").toBeTruthy();
        const storeId = store?.id ?? "";
        const product = await api.post<{ id: string }>(
            `/stores/${storeId}/products`,
            { name: `Candle ${s}`, price: "25", status: "PUBLISHED" },
        );
        const order = await api.post<{ id: string }>(
            `/stores/${storeId}/orders`,
            {
                customer: {
                    email: `u10o-${s}@example.com`.toLowerCase(),
                    name: "Jo Rivera",
                },
                items: [{ productId: product.id, quantity: 1 }],
            },
        );
        const { url } = await api.post<{ url: string }>(
            `/orders/${order.id}/pay-link`,
        );
        const paymentStatus = async () =>
            (await api.get<{ paymentStatus: string }>(`/orders/${order.id}`))
                .paymentStatus;

        await stubCheckout(page);
        await page.goto(
            new URL(new URL(url).pathname, urls.RENDERER_URL).toString(),
        );
        await pressUntil(
            page.getByRole("button", { name: /^Pay \$25(\.00)?$/ }),
            () => Promise.resolve(page.url().startsWith(CHECKOUT_ORIGIN)),
        );
        await page.waitForURL(CHECKOUT);
        const session = sessionOf(page.url());

        await page.getByRole("link", { name: "Pay" }).click();
        await page.waitForURL(/\/paid\?session_id=cs_fake_/);
        await expect(heading(page, "Confirming your payment")).toBeVisible();

        const read = await readSession(page, session.sessionId);
        expect(read.kind).toBe("order");
        await sendWebhook(
            page,
            b,
            sessionEvent(
                "checkout.session.completed",
                session,
                read.amountCents,
                tag,
                order.id,
            ),
        );
        await expect(heading(page, "Payment received")).toBeVisible({
            timeout: 30_000,
        });
        await expect.poll(paymentStatus, { timeout: 30_000 }).toBe("PAID");
    });

    test("a booking hold: held for 30 minutes, paid on Stripe's page, confirming on /paid, then booked once the session's webhook lands", async ({
        page,
        browser,
        context,
    }, testInfo) => {
        test.setTimeout(180_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const { b, site, serviceId } = await stripeBookingSite(
            page,
            browser,
            testInfo,
            "stripe-bk",
        );

        const customer = await context.newPage();
        await asNewVisitor(customer);
        await stubCheckout(customer);
        const { payToken, session } = await bookAndLeaveForStripe(
            customer,
            site,
            serviceId,
            `u10b-${tag}@example.com`.toLowerCase(),
        );

        // A Stripe hold lasts as long as its session: 30 minutes, not 15.
        const held = await page.request.get(
            `${urls.API_URL}/public/services/holds/${payToken}`,
        );
        const hold = (await held.json()) as {
            state: string;
            holdExpiresAt: string;
        };
        expect(hold.state).toBe("HELD");
        const left = Date.parse(hold.holdExpiresAt) - Date.now();
        expect(left).toBeGreaterThan(25 * 60_000);
        expect(left).toBeLessThanOrEqual(32 * 60_000);

        await customer.getByRole("link", { name: "Pay" }).click();
        await customer.waitForURL(
            (u) => u.pathname === "/paid" && u.origin === site,
        );
        await expect(
            heading(customer, "Confirming your payment"),
        ).toBeVisible();

        const read = await readSession(page, session.sessionId);
        expect(read.kind).toBe("hold");
        await sendWebhook(
            page,
            b,
            sessionEvent(
                "checkout.session.completed",
                session,
                read.amountCents,
                tag,
            ),
        );
        await expect(heading(customer, "You're booked")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            customer.getByText(/You paid \$25(\.00)?\./),
        ).toBeVisible();
        await expect(
            customer.getByRole("link", { name: `Back to ${b.name}` }),
        ).toBeVisible();
        await customer.close();
    });

    test("a booking hold: Back on Stripe's page lets the time go, and a payment that lands after is being refunded", async ({
        page,
        browser,
        context,
    }, testInfo) => {
        test.setTimeout(180_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const { b, site, serviceId } = await stripeBookingSite(
            page,
            browser,
            testInfo,
            "stripe-bc",
        );

        const customer = await context.newPage();
        await asNewVisitor(customer);
        await stubCheckout(customer);
        const { payToken, session } = await bookAndLeaveForStripe(
            customer,
            site,
            serviceId,
            `u10c-${tag}@example.com`.toLowerCase(),
        );
        const open = await readSession(page, session.sessionId);
        expect(open.status).toBe("open");
        const startAt = open.booking?.startAt ?? "";
        expect(startAt).toBeTruthy();

        const offered = async () => {
            const res = await page.request.get(
                `${urls.API_URL}/public/services/${serviceId}/days`,
            );
            return (
                (await res.json()) as {
                    days: { starts: { startAt: string }[] }[];
                }
            ).days.flatMap((d) => d.starts.map((x) => x.startAt));
        };
        expect(await offered()).not.toContain(startAt);

        // Back: the session closes, the hold lets its time go, and the
        // customer is on the booking page they paid from.
        await customer.getByRole("link", { name: "Back" }).click();
        await customer.waitForURL(
            (u) => u.origin === site && u.pathname === "/book",
            { timeout: 30_000 },
        );
        expect((await readSession(page, session.sessionId)).status).toBe(
            "closed",
        );
        const after = await page.request.get(
            `${urls.API_URL}/public/services/holds/${payToken}`,
        );
        expect(after.status()).toBe(404);
        expect(await offered()).toContain(startAt);

        // Paid anyway, after the time was let go: refunded on its own.
        await sendWebhook(
            page,
            b,
            sessionEvent(
                "checkout.session.completed",
                session,
                open.amountCents,
                tag,
            ),
        );
        await expect
            .poll(
                async () => (await readSession(page, session.sessionId)).status,
                { timeout: 30_000 },
            )
            .toBe("refunding");
        await customer.goto(`${site}/paid?session_id=${session.sessionId}`);
        await expect(
            heading(customer, "Your money is on its way back"),
        ).toBeVisible();
        await customer.close();
    });

    test("a booking hold whose session expired can't be paid again: checkout-closed, and /paid sends the customer to pick a time again", async ({
        page,
        browser,
        context,
    }, testInfo) => {
        test.setTimeout(180_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const { b, site, serviceId } = await stripeBookingSite(
            page,
            browser,
            testInfo,
            "stripe-bx",
        );

        const customer = await context.newPage();
        await asNewVisitor(customer);
        await stubCheckout(customer);
        const { payToken, session } = await bookAndLeaveForStripe(
            customer,
            site,
            serviceId,
            `u10x-${tag}@example.com`.toLowerCase(),
        );
        const open = await readSession(page, session.sessionId);

        // Stripe expires the session.
        await sendWebhook(
            page,
            b,
            sessionEvent(
                "checkout.session.expired",
                session,
                open.amountCents,
                tag,
            ),
        );

        // Pressing Pay again, under a new key, gets no new session: the
        // hold paid through its first one only (KTD-13).
        await expect
            .poll(
                async () => {
                    const res = await page.request.post(
                        `${urls.API_URL}/public/invoices/${payToken}/payment-intent`,
                        {
                            headers: { "content-type": "application/json" },
                            data: { idempotencyKey: `again-${tag}` },
                        },
                    );
                    return `${res.status()} ${await res.text()}`;
                },
                { timeout: 30_000 },
            )
            .toMatch(/^409 .*checkout-closed/);

        await customer.goto(`${site}/paid?session_id=${session.sessionId}`);
        await expect(
            heading(customer, "This payment has closed"),
        ).toBeVisible();
        await expect(customer.getByText(/Pick a time again/)).toBeVisible();
        await customer.getByRole("link", { name: "Try again" }).click();
        await customer.waitForURL(
            (u) => u.origin === site && u.pathname === "/book",
        );

        // Nothing was paid: let the hold go.
        await page.request.post(
            `${urls.API_URL}/public/services/holds/${payToken}/release`,
        );
        await customer.close();
    });

    test("a business that chose Pay on our page: a pay link opens Saroh's card window on the business's country, and the PaymentIntent's webhook settles it", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        const s = stamp(testInfo);
        const tag = s.replace(/[^A-Za-z0-9]/g, "");
        const b = await stripeBusiness(page, browser, testInfo, "stripe-w");
        const api = business(page.request, b.id);
        const chosen = await api.patch<{ checkoutStyle: string }>(
            "/payment-providers/STRIPE/checkout-style",
            { checkoutStyle: "WINDOW" },
        );
        expect(chosen.checkoutStyle).toBe("WINDOW");

        const contact = await api.post<{ id: string }>("/contacts", {
            email: `window-${s}@example.com`.toLowerCase(),
            firstName: "Jo",
            lastName: `Window ${s}`,
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

        // Stripe.js, stood in for: the Payment Element is a plain box, and
        // confirming answers a card payment that succeeded. What the window
        // asked of it is kept on the page.
        await page.route("https://js.stripe.com/**", (route: Route) =>
            route.fulfill({
                contentType: "application/javascript",
                body: `window.__stripe = { elements: null, element: null, confirms: [] };
                window.Stripe = function (key) {
                    return {
                        elements: function (o) {
                            window.__stripe.elements = { key: key, clientSecret: o.clientSecret };
                            return {
                                create: function (_t, options) {
                                    window.__stripe.element = options;
                                    return {
                                        mount: function (el) { el.textContent = "Card details (stub)"; },
                                    };
                                },
                            };
                        },
                        confirmPayment: function (o) {
                            window.__stripe.confirms.push({ redirect: o.redirect, confirmParams: o.confirmParams || null });
                            var id = window.__stripe.elements.clientSecret.split("_secret_")[0];
                            return Promise.resolve({ paymentIntent: { id: id, status: "succeeded" } });
                        },
                    };
                };`,
            }),
        );
        const left: string[] = [];
        page.on("framenavigated", (f) => {
            if (f.url().startsWith(CHECKOUT_ORIGIN)) left.push(f.url());
        });

        // The pay page starts the intent server to server (a server
        // action, `lib/invoice-pay.ts`), so the browser sees only the
        // action's answer, which carries the intent. Read once each has
        // finished: a body read on its response event can be gone.
        const answers: string[] = [];
        page.on("requestfinished", (r) => {
            if (r.method() !== "POST" || !r.url().includes(`/pay/${token}`)) {
                return;
            }
            void r
                .response()
                .then((res) => res?.text())
                .then((t) => t && answers.push(t))
                .catch(() => undefined);
        });
        await page.goto(`${urls.RENDERER_URL}/pay/${token}`);
        // Pressed until hydrated, as the hosted test does.
        await pressUntil(
            page.getByRole("button", { name: /^Pay \$25(\.00)?$/ }),
            () => page.getByRole("dialog").isVisible(),
        );
        const withIntent = () =>
            answers.find((t) => t.includes('"paymentIntentId":"')) ?? "";
        await expect.poll(withIntent).not.toBe("");
        const answer = withIntent();
        const field = (name: string) =>
            new RegExp(`"${name}":"([^"]+)"`).exec(answer)?.[1] ?? "";
        const intent = {
            paymentIntentId: field("paymentIntentId"),
            providerIntentId: field("providerIntentId"),
        };
        expect(intent.providerIntentId).toMatch(/^pi_fake_/);
        expect(answer).toContain(
            `"clientSecret":"${intent.providerIntentId}_secret_`,
        );
        expect(answer).not.toContain("checkoutUrl");

        // The window, on the page: never Stripe's hosted Checkout.
        const cardWindow = page.getByRole("dialog");
        await expect(cardWindow).toBeVisible();
        await expect(cardWindow.getByText("Card details (stub)")).toBeVisible();
        const asked = await page.evaluate(
            () =>
                (window as unknown as { __stripe: Record<string, unknown> })
                    .__stripe,
        );
        expect(asked.elements).toMatchObject({ key: PUBLISHABLE });
        // The card's country starts on the business's (US), not a guess.
        expect(asked.element).toMatchObject({
            defaultValues: { billingDetails: { address: { country: "US" } } },
        });

        await cardWindow.getByRole("button", { name: /^Pay \$25/ }).click();
        await expect(cardWindow).toBeHidden({ timeout: 15_000 });
        expect(left).toEqual([]);

        // The fake finds no payment on the return; the PaymentIntent's own
        // webhook, with Saroh's references on it, settles the invoice.
        await sendWebhook(
            page,
            b,
            event("payment_intent.succeeded", tag, {
                id: intent.providerIntentId,
                object: "payment_intent",
                amount: 2500,
                amount_received: 2500,
                currency: "usd",
                status: "succeeded",
                latest_charge: `ch_fake_${tag}`,
                metadata: {
                    saroh_ref: draft.id,
                    saroh_intent: intent.paymentIntentId,
                },
            }),
        );
        await expect
            .poll(
                async () => {
                    const res = await page.request.get(
                        `${urls.API_URL}/public/invoices/${token}`,
                    );
                    return ((await res.json()) as { status: string }).status;
                },
                { timeout: 30_000 },
            )
            .toBe("PAID");
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
