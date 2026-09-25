import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * The customer's booking page on a merchant's site, end to end (U19):
 * pay at the desk — the booking lands in the team's calendar, paid at the
 * desk — and pay now, where the time is held while the customer pays and
 * nobody else can book it.
 *
 * It runs on Northwind Supply, the base seed's site (`northwind.<renderer>`),
 * not Pulse Fitness, which is kept camera-ready. Every booking it makes is
 * cancelled again at the end.
 *
 * What it cannot do is finish a payment: the seed's provider credentials are
 * placeholders and a test cannot complete a provider's checkout, so the
 * webhook that confirms a paid hold is covered by the API's integration spec
 * (`public-booking.db.spec.ts`) — the same way the invoices e2e records the
 * money by hand. Here, pay now is followed as far as the hold: held, the
 * time gone for everyone else, and let go again.
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

/** Open the page on the service and pick a free time; returns its label. */
async function pickTime(page: Page, nth: number): Promise<string> {
    await page.goto(`${SITE}/book`);
    await expect(
        page.getByRole("heading", { name: "Book your next session" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: new RegExp(SERVICE) }).click();
    const times = page.locator('[role="radiogroup"] button[role="radio"]', {
        hasText: /^\d{2}:\d{2}$/,
    });
    await expect(times.first()).toBeVisible({ timeout: 15_000 });
    const time = times.nth(nth);
    const label = (await time.innerText()).trim();
    await time.click();
    await expect(time).toHaveAttribute("aria-checked", "true");
    return label;
}

async function details(page: Page, email: string) {
    await page.getByLabel("Name").fill("Asha Rao");
    await page.getByLabel("Email").fill(email);
}

/** The phone bar's short label, or the summary card's long one. */
function confirmButton(page: Page, long: RegExp, short: string) {
    return page
        .getByRole("button", { name: long })
        .or(page.getByRole("button", { name: short, exact: true }))
        .first();
}

test.describe("the booking page", () => {
    test("pay at the desk: booked, and in the team's calendar as paid at the desk", async ({
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

        await details(page, email);
        await page.getByRole("radio", { name: /Pay at the desk/ }).click();
        const answer = page.waitForResponse(
            (r) => r.url().endsWith("/book") && r.request().method() === "POST",
        );
        await confirmButton(page, /^Book — pay at the desk$/, "Book").click();
        const booked = (await (await answer).json()) as { reference: string };

        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible();
        await expect(
            page.getByText(/at the front desk when you arrive/),
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
        const from = new Date(Date.now() - 86_400_000).toISOString();
        const to = new Date(Date.now() + 15 * 86_400_000).toISOString();
        const paidWith = async () => {
            const res = await page.request.get(
                `${urls.API_URL}/organizations/${ORG}/services/bookings?from=${from}&to=${to}`,
            );
            if (!res.ok()) return `HTTP ${res.status()}`;
            const calendar = (await res.json()) as {
                diaries: {
                    bookings: { id: string; paidWith: string | null }[];
                }[];
            };
            return calendar.diaries
                .flatMap((d) => d.bookings)
                .find((b) => b.id === booked.reference)?.paidWith;
        };
        await expect.poll(paidWith, { timeout: 15_000 }).toBe("DESK");

        await page.request.delete(
            `${urls.API_URL}/organizations/${ORG}/services/bookings/${booked.reference}`,
        );
    });

    test("pay now: the time is held for the customer, and no one else can book it", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const email = `now-${testInfo.project.name}-${Date.now()}@example.in`;
        const label = await pickTime(page, 2);
        await details(page, email);
        await expect(
            page.getByRole("radio", { name: /^Pay ₹.* for this session/ }),
        ).toHaveAttribute("aria-checked", "true");

        const answer = page.waitForResponse(
            (r) => r.url().endsWith("/book") && r.request().method() === "POST",
        );
        await confirmButton(page, /^Pay ₹.* and book$/, "Pay and book").click();
        const response = await answer;
        const serviceId = new URL(response.url()).pathname.split("/")[3];
        const held = (await response.json()) as {
            state: string;
            startAt: string;
            holdExpiresAt: string;
            payToken: string;
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
        expect(offered).not.toContain(held.startAt);
        const hold = await other.request.get(
            `${urls.API_URL}/public/services/holds/${held.payToken}`,
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
            `${urls.API_URL}/public/services/holds/${held.payToken}`,
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
        ).toContain(held.startAt);
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
        const bookBodies: { pay: string; idempotencyKey: string }[] = [];
        page.on("request", (request) => {
            if (
                request.url().endsWith("/book") &&
                request.method() === "POST"
            ) {
                bookBodies.push(
                    request.postDataJSON() as {
                        pay: string;
                        idempotencyKey: string;
                    },
                );
            }
        });

        await pickTime(page, 3);
        await details(page, email);
        const answer = page.waitForResponse(
            (r) => r.url().endsWith("/book") && r.request().method() === "POST",
        );
        await confirmButton(page, /^Pay ₹.* and book$/, "Pay and book").click();
        const response = await answer;
        const serviceId = new URL(response.url()).pathname.split("/")[3];

        const desk = page.getByRole("button", {
            name: "Book it to pay at the desk",
        });
        await expect(desk).toBeVisible();
        const deskAnswer = page.waitForResponse(
            (r) =>
                r.url().endsWith("/book") &&
                r.request().method() === "POST" &&
                (r.request().postDataJSON() as { pay: string }).pay === "DESK",
        );
        await desk.dblclick();
        const booked = (await (await deskAnswer).json()) as {
            reference: string;
            state: string;
        };
        expect(booked.state).toBe("CONFIRMED");
        await expect(
            page.getByRole("heading", { name: "You're booked, Asha." }),
        ).toBeVisible();
        expect(bookBodies.filter((b) => b.pay === "DESK")).toHaveLength(1);
        // The let-go hold's time is the one booked at the desk.
        const hold = (await response.json()) as { startAt: string };
        const days = await page.request.get(
            `${urls.API_URL}/public/services/${serviceId}/days`,
        );
        expect(
            (
                (await days.json()) as {
                    days: { starts: { startAt: string }[] }[];
                }
            ).days.flatMap((d) => d.starts.map((s) => s.startAt)),
        ).not.toContain(hold.startAt);

        await signIn(page);
        await page.request.delete(
            `${urls.API_URL}/organizations/${ORG}/services/bookings/${booked.reference}`,
        );
    });
});
