import type { Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, ignoreHTTPSErrors, urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * The customer's booking page on a merchant's site, end to end (U19):
 * pay at the desk — the booking lands in the team's calendar, paid at the
 * desk — and pay now, where the time is held while the customer pays and
 * nobody else can book it.
 *
 * Sign-in is always on (round-2 A9): every booking here gives a name, taps
 * "Continue to sign in", and confirms a fresh email with the code the fake
 * transport leaves in its outbox (`site-codes.ts`). The booking is made by
 * the site's server with the session, so the tests find it by that email
 * in the team's calendar, and a pay-now hold by the token its payment and
 * its poll carry.
 *
 * It runs on Northwind Supply, the base seed's site (`northwind.<renderer>`),
 * not Pulse Fitness, which is kept camera-ready. Every booking it makes is
 * cancelled again at the end.
 *
 * What it cannot do is take real money: the seed's provider credentials are
 * placeholders, so the API cannot make a provider order, and the webhook that
 * confirms a paid hold is covered by the API's integration spec
 * (`public-booking.db.spec.ts`) — the same way the invoices e2e records the
 * money by hand. Pay now is followed as far as the hold: held, the time gone
 * for everyone else, and let go again. The checkout itself (E11) runs against
 * a fake provider: the handoff and Razorpay's script are stood in for in the
 * browser, and the hold reads confirmed once the fake window has paid.
 */

const ORG = "seed_org";
const SITE = (() => {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//northwind.${renderer.host}`;
})();
const SERVICE = "Warehouse walkthrough";

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
}

/**
 * Open the page on the service and pick a free time: its label, and the
 * service's id (from the page's own read of its days).
 */
async function pickTime(
    page: Page,
    nth: number,
): Promise<{ label: string; serviceId: string }> {
    await page.goto(`${SITE}/book`);
    await expect(
        page.getByRole("heading", { name: "Book your appointment" }),
    ).toBeVisible();
    const daysRead = page.waitForRequest((r) =>
        /\/public\/services\/[^/]+\/days$/.test(new URL(r.url()).pathname),
    );
    await page.getByRole("radio", { name: new RegExp(SERVICE) }).click();
    const serviceId =
        new URL((await daysRead).url()).pathname.split("/")[3] ?? "";
    // The furthest day with free times, never today: late in the day today
    // may have fewer free times left than the test picks from.
    const openDays = page.getByRole("radio", { name: /times? free/ });
    await expect(openDays.first()).toBeVisible({ timeout: 15_000 });
    await openDays.nth((await openDays.count()) - 1).click();
    const times = page.locator('[role="radiogroup"] button[role="radio"]', {
        hasText: /^\d{2}:\d{2}$/,
    });
    await expect(times.first()).toBeVisible({ timeout: 15_000 });
    const time = times.nth(nth);
    const label = (await time.innerText()).trim();
    await time.click();
    await expect(time).toHaveAttribute("aria-checked", "true");
    return { label, serviceId };
}

/** Who they are: a name — the email is confirmed with a code (A9). */
async function details(page: Page) {
    await expect(
        page.getByText(/You'll confirm your email with a code/),
    ).toBeVisible();
    // No guest form: nobody types an email or a phone on the page.
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByLabel(/Phone/)).toHaveCount(0);
    await page.getByLabel("Name").fill("Asha Rao");
}

/** The last step: sign in with a code, and the booking is made. */
async function continueAndSignIn(page: Page, email: string) {
    await page
        .getByRole("button", { name: "Continue to sign in" })
        .first()
        .click();
    await signInOnSheet(page, email);
}

/** The pay token a hold's payment is started with (E11). */
function payTokenOf(request: Request): string {
    return new URL(request.url()).pathname.split("/")[3] ?? "";
}

/** The server action's booking requests, as the page sent them. */
function watchBookings(page: Page): { pay: string; idempotencyKey: string }[] {
    const bodies: { pay: string; idempotencyKey: string }[] = [];
    page.on("request", (request) => {
        if (request.method() !== "POST" || !request.headers()["next-action"]) {
            return;
        }
        let args: unknown;
        try {
            args = request.postDataJSON();
        } catch {
            return;
        }
        const first = Array.isArray(args) ? (args[0] as unknown) : null;
        if (
            first &&
            typeof first === "object" &&
            "pay" in first &&
            "idempotencyKey" in first
        ) {
            bodies.push(first as { pay: string; idempotencyKey: string });
        }
    });
    return bodies;
}

interface CalendarBooking {
    id: string;
    bookerEmail: string | null;
    paidWith: string | null;
    status?: string;
}

/** Signed in as staff: the bookings the calendar holds for `email`. */
async function bookingsFor(
    page: Page,
    email: string,
): Promise<CalendarBooking[]> {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 15 * 86_400_000).toISOString();
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${ORG}/services/bookings?from=${from}&to=${to}`,
    );
    if (!res.ok()) return [];
    const calendar = (await res.json()) as {
        diaries: { bookings: CalendarBooking[] }[];
    };
    return calendar.diaries
        .flatMap((d) => d.bookings)
        .filter((b) => b.bookerEmail === email);
}

async function cancel(page: Page, id: string) {
    await page.request.delete(
        `${urls.API_URL}/organizations/${ORG}/services/bookings/${id}`,
        // The API refuses a write with no Origin (#50).
        { headers: { origin: urls.APP_URL } },
    );
}

test.describe("the booking page", () => {
    // Each test is a different customer, from an address of their own.
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("pay at the desk: signed in at the last step, booked, and in the team's calendar as paid at the desk", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `desk-${testInfo.project.name}-${Date.now()}@example.in`;
        await pickTime(page, 1);

        // Days say what they are: Full, Closed, or how many are free.
        await expect(
            page
                .getByRole("radiogroup", { name: "Day" })
                .getByRole("radio")
                .first(),
        ).toHaveAttribute("aria-label", /: (\d+ times? free|full|closed)$/);

        await details(page);
        await page.getByRole("radio", { name: /Pay at the desk/ }).click();
        await continueAndSignIn(page, email);

        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
            page.getByText(/at the front desk when you arrive/),
        ).toBeVisible();
        await expect(
            page.getByText(
                /We've saved this to your details with Northwind Supply\./,
            ),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Add to calendar" }),
        ).toBeVisible();
        // Saroh sends no message, so the page promises none.
        await expect(
            page.getByText(/on its way|we'll text|we'll email/i),
        ).toHaveCount(0);

        // The team's calendar has it, paid at the desk.
        await signIn(page);
        await expect
            .poll(
                async () =>
                    (await bookingsFor(page, email)).map((b) => b.paidWith),
                { timeout: 15_000 },
            )
            .toEqual(["DESK"]);
        for (const b of await bookingsFor(page, email))
            await cancel(page, b.id);
    });

    test("pay now: the time is held for the customer, and no one else can book it", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `now-${testInfo.project.name}-${Date.now()}@example.in`;
        const { label, serviceId } = await pickTime(page, 2);
        await details(page);
        await expect(
            page.getByRole("radio", { name: /^Pay ₹\S+ now UPI or card/ }),
        ).toHaveAttribute("aria-checked", "true");

        const intent = page.waitForRequest((r) =>
            r.url().includes("/payment-intent"),
        );
        const polled = page.waitForResponse(
            (r) =>
                r.url().includes("/public/services/holds/") &&
                r.request().method() === "GET",
        );
        await continueAndSignIn(page, email);
        const payToken = payTokenOf(await intent);
        const held = (await (await polled).json()) as {
            state: string;
            holdExpiresAt: string;
            booking: { startAt: string };
        };
        expect(held.state).toBe("HELD");
        expect(Date.parse(held.holdExpiresAt) - Date.now()).toBeLessThanOrEqual(
            15 * 60_000,
        );

        await expect(
            page.getByRole("heading", { name: /to confirm your place$/ }),
        ).toBeVisible();
        await expect(
            page.getByText(/held for you until \d{2}:\d{2}/),
        ).toBeVisible();

        // Everyone else, meanwhile, is no longer offered that time.
        const other = await browser.newContext({ ignoreHTTPSErrors });
        const days = await other.request.get(
            `${urls.API_URL}/public/services/${serviceId}/days`,
        );
        const offered = (
            (await days.json()) as {
                days: { starts: { startAt: string }[] }[];
            }
        ).days.flatMap((d) => d.starts.map((s) => s.startAt));
        expect(offered).not.toContain(held.booking.startAt);
        const hold = await other.request.get(
            `${urls.API_URL}/public/services/holds/${payToken}`,
        );
        expect(((await hold.json()) as { state: string }).state).toBe("HELD");
        await other.close();

        // Let it go: back to choosing, and the hold reads released.
        await page
            .getByRole("button", {
                name: /^(Cancel and pick another time|Pick another time)$/,
            })
            .click();
        await expect(
            page.getByRole("heading", { name: "What would you like?" }),
        ).toBeVisible();
        const after = await page.request.get(
            `${urls.API_URL}/public/services/holds/${payToken}`,
        );
        // Released: its token is cleared with its draft invoice, and the
        // time is offered again.
        expect(after.status()).toBe(404);
        expect(label).toMatch(/^\d{2}:\d{2}$/);
        const again = await page.request.get(
            `${urls.API_URL}/public/services/${serviceId}/days`,
        );
        expect(
            (
                (await again.json()) as {
                    days: { starts: { startAt: string }[] }[];
                }
            ).days.flatMap((d) => d.starts.map((s) => s.startAt)),
        ).toContain(held.booking.startAt);
    });

    test("pay now falls back to the desk: a double tap makes one booking (#508)", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `fallback-${testInfo.project.name}-${Date.now()}@example.in`;
        // The payment cannot start, so the page offers the desk instead.
        await page.route("**/payment-intent", (route) =>
            route.fulfill({ status: 500, body: "{}" }),
        );
        const bookBodies = watchBookings(page);

        await pickTime(page, 3);
        await details(page);
        await continueAndSignIn(page, email);

        const desk = page.getByRole("button", {
            name: "Book it to pay at the desk",
        });
        await expect(desk).toBeVisible({ timeout: 15_000 });
        await desk.dblclick();
        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible({ timeout: 15_000 });
        expect(bookBodies.filter((b) => b.pay === "NOW")).toHaveLength(1);
        expect(bookBodies.filter((b) => b.pay === "DESK")).toHaveLength(1);

        // One booking stands, paid at the desk; the let-go hold doesn't.
        await signIn(page);
        await expect
            .poll(
                async () =>
                    (await bookingsFor(page, email))
                        .filter((b) => b.paidWith === "DESK")
                        .map((b) => b.paidWith),
                { timeout: 15_000 },
            )
            .toEqual(["DESK"]);
        for (const b of await bookingsFor(page, email))
            await cancel(page, b.id);
    });

    test("pay now completes against a fake provider: UPI or card, then Paying… until the hold is confirmed (E11)", async ({
        page,
        request,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `paid-${testInfo.project.name}-${Date.now()}@example.in`;

        // The fake provider: the API's handoff for the hold's invoice, and
        // Razorpay's script, which opens a window that pays at once.
        await page.route("**/payment-intent", (route) =>
            route.fulfill({
                status: 201,
                contentType: "application/json",
                body: JSON.stringify({
                    paymentIntentId: "pi_e2e",
                    provider: "RAZORPAY",
                    providerIntentId: "order_e2e",
                    amountCents: 150_000,
                    currency: "INR",
                    publicKey: "rzp_test_e2e",
                    clientParams: { razorpayOrderId: "order_e2e" },
                }),
            }),
        );
        await page.route(
            "https://checkout.razorpay.com/v1/checkout.js",
            (route) =>
                route.fulfill({
                    contentType: "application/javascript",
                    body: `window.Razorpay = function (options) {
                    window.__razorpay = JSON.parse(JSON.stringify(options));
                    return {
                        open: function () {
                            setTimeout(function () {
                                options.handler({ razorpay_payment_id: "pay_e2e", razorpay_order_id: options.order_id });
                            }, 300);
                        },
                        close: function () {},
                        on: function () {},
                    };
                };`,
                }),
        );
        // The webhook's part: once the window has paid, the hold reads
        // confirmed. Until then the page asks the real API.
        let confirmed = false;
        await page.route("**/public/services/holds/*", (route) =>
            confirmed && route.request().method() === "GET"
                ? route.fulfill({
                      contentType: "application/json",
                      body: JSON.stringify({
                          state: "CONFIRMED",
                          holdExpiresAt: null,
                      }),
                  })
                : route.continue(),
        );

        await pickTime(page, 4);
        await details(page);
        const intent = page.waitForRequest((r) =>
            r.url().includes("/payment-intent"),
        );
        await continueAndSignIn(page, email);
        const payToken = payTokenOf(await intent);

        // The window paid: Paying…, and no way to let the hold go.
        await expect(page.getByText("Paying…")).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Cancel and pick another time" }),
        ).toHaveCount(0);
        const opened = (await page.evaluate(
            () => (window as unknown as { __razorpay: unknown }).__razorpay,
        )) as {
            key: string;
            order_id: string;
            prefill: { email: string };
            config: {
                display: {
                    blocks: Record<
                        string,
                        { instruments: { method: string }[] }
                    >;
                };
            };
        };
        expect(opened.key).toBe("rzp_test_e2e");
        expect(opened.order_id).toBe("order_e2e");
        // The account's verified email, not one typed on the page.
        expect(opened.prefill.email).toBe(email);
        expect(
            Object.values(opened.config.display.blocks).flatMap((b) =>
                b.instruments.map((i) => i.method),
            ),
        ).toEqual(["upi", "card"]);

        confirmed = true;
        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/^Paid ₹.* online\.$/)).toBeVisible();

        // Nothing was paid for real: let the hold go.
        await request.post(
            `${urls.API_URL}/public/services/holds/${payToken}/release`,
        );
    });
});
