// @covers accounts:/login app:/open app:/bookings app:/bookings/[bookingId] api:bookings api:contacts api:invoices api:payments
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, phone, stamp } from "../fixtures/own-data";
import type { OwnService } from "../fixtures/own-service";
import { bookOnOwn, ownService, STEP_MS } from "../fixtures/own-service";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The desk's money and attendance, end to end (#1016 review): what the
 * component tests only reach through a mocked server action.
 *
 * - Book by name and phone with Paid now by UPI, and the booking's page
 *   says it is paid at the desk, by UPI.
 * - Came waits its ten seconds, is then written, and a reload still says
 *   Came; Undo inside the ten seconds writes nothing.
 * - Cancelling a booking paid at the desk, and the refund choice a booking
 *   paid online is cancelled with.
 *
 * Every write is on Northwind, on a service each test makes for itself
 * (`fixtures/own-service.ts`), so its times are its own; the service is
 * archived and its bookings cancelled at the end. The refund choice needs
 * a booking paid online, which a dev stack's placeholder provider can't
 * take: it is read on a showcase business and nothing is cancelled there.
 */

const NORTHWIND = "seed_org";

async function signIn(page: Page) {
    await useSession(page, "owner");
    await page.goto(`/open/${NORTHWIND}`);
}

interface BookingRead {
    id: string;
    status: string;
    outcome: string | null;
    contact: { id: string } | null;
    money?: {
        paidOnlineCents: number;
        paidAtDeskCents?: number | null;
        deskMethod?: string | null;
        refundableCents?: number | null;
        refund?: unknown;
        treatmentOrderId?: string | null;
    } | null;
}

const readBooking = (request: APIRequestContext, id: string) =>
    northwind(request).get<BookingRead>(`/services/bookings/${id}`);

/** Cancel what the test booked, take its customer away, archive its service. */
async function tidy(
    request: APIRequestContext,
    service: OwnService,
    bookingIds: (string | null)[],
) {
    const nw = northwind(request);
    for (const id of bookingIds) {
        if (!id) continue;
        const read = await request.get(
            `${urls.API_URL}/organizations/${NORTHWIND}/services/bookings/${id}`,
            { headers: nw.headers },
        );
        const booking = read.ok() ? ((await read.json()) as BookingRead) : null;
        if (booking && booking.status !== "CANCELLED") {
            await nw.delete(`/services/bookings/${id}`);
        }
        if (booking?.contact)
            await nw.delete(`/contacts/${booking.contact.id}`);
    }
    await service.remove();
}

/** New booking's own button: beside "…" at a desk, floating on a phone. */
const newBooking = (page: Page) =>
    page
        .getByRole("button", { name: "New booking", exact: true })
        .filter({ visible: true })
        .first();

/** The sticky foot's one button: "Next: …", "Add and use", "Book …". */
const next = (sheet: Locator) =>
    sheet.locator('[data-overlay-foot] button[type="submit"]');

/** More on a booking's page: "…" on a phone, a button at a desk. */
const more = (page: Page) =>
    page
        .getByRole("button", { name: "More", exact: true })
        .filter({ visible: true })
        .first();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("the desk's money and attendance (#1016)", () => {
    test("books by name and phone, Paid now by UPI, and the page says it's paid", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const service = await ownService(page.request, testInfo, "Paid now");
        const name = `Upi ${stamp(testInfo)}`;
        let bookingId: string | null = null;
        try {
            await page.goto("/bookings");
            await newBooking(page).click();
            const sheet = page.getByRole("dialog", { name: "New booking" });
            await expect(sheet).toBeVisible();

            // Who: a caller by name and phone alone (DEC-170).
            await sheet.getByLabel("Find the customer").fill(name);
            await sheet
                .getByRole("button", { name: new RegExp(`Add “${name}”`) })
                .click();
            await sheet.getByLabel("Phone").fill(phone().replace("+91 ", ""));
            await expect(next(sheet)).toHaveText("Add and use");
            await next(sheet).click();

            // What: this test's own service.
            await expect(
                sheet.getByText("Step 2 of 5 · Service").first(),
            ).toBeVisible();
            await sheet
                .getByRole("radiogroup", { name: "Service" })
                .getByRole("radio", { name: new RegExp(escape(service.name)) })
                .click();
            await next(sheet).click();

            // With, where it is asked: nobody takes it, so it isn't.
            const when = sheet.getByText("Step 4 of 5 · Day and time").first();
            const withWho = sheet.getByText(/^Step 3 of 5/).first();
            await expect(when.or(withWho)).toBeVisible();
            if (await withWho.isVisible()) await next(sheet).click();
            await expect(when).toBeVisible();

            // When: the service is open all day, every day, and only this
            // test books it.
            const time = sheet
                .getByRole("radio", { name: /^\d{1,2}:\d\d [ap]m/ })
                .first();
            await expect(
                time.or(sheet.getByRole("button", { name: /^Next free day/ })),
            ).toBeVisible();
            if (!(await time.isVisible())) {
                await sheet
                    .getByRole("button", { name: /^Next free day/ })
                    .click();
            }
            await time.click();
            await next(sheet).click();

            // Check and book: Paid now asks how, then UPI.
            await expect(
                sheet.getByText("Step 5 of 5 · Check and book").first(),
            ).toBeVisible();
            await sheet.getByRole("radio", { name: /^Paid now/ }).click();
            await sheet
                .getByRole("radio", { name: "UPI", exact: true })
                .click();
            await expect(
                sheet.getByText(/^Record it once ₹.* shows on your UPI app\.$/),
            ).toBeVisible();
            await expect(next(sheet)).toHaveText(/^Book Upi · /);
            await next(sheet).click();

            await expect(
                sheet.getByRole("heading", { name: "Upi is booked" }),
            ).toBeVisible();
            const view = await sheet
                .getByRole("link", { name: "View booking" })
                .filter({ visible: true })
                .first()
                .getAttribute("href");
            bookingId = view?.split("/").at(-1) ?? null;
            expect(bookingId).toBeTruthy();

            // The API wrote the booking and its desk payment together.
            const saved = await readBooking(page.request, bookingId ?? "");
            expect(saved.money?.paidAtDeskCents).toBe(service.priceCents);
            expect(saved.money?.deskMethod).toBe("UPI");

            // And its page says so.
            await page.goto(`/bookings/${bookingId}`);
            const money = page.getByRole("region", { name: "Money" });
            await expect(money).toContainText(/paid at the desk · UPI/);
            await expect(money).toContainText("Nothing, it's paid");
        } finally {
            await tidy(page.request, service, [bookingId]);
        }
    });

    test("Came waits ten seconds, is written, and a reload still says Came", async ({
        page,
    }, testInfo) => {
        // The page's own clock, so the hold is run out rather than slept
        // through. Installed before the page loads; it keeps time.
        await page.clock.install();
        await signIn(page);
        const service = await ownService(page.request, testInfo, "Came");
        const booked = await bookOnOwn(page.request, service, {
            name: `Came ${stamp(testInfo)}`,
            phone: phone(),
        });
        try {
            await page.goto(`/bookings/${booked.id}`);
            const came = page.getByRole("button", {
                name: "Came",
                exact: true,
            });
            await expect(came).toHaveAttribute("aria-pressed", "false");
            await came.click();
            // Shown at once; nothing is written for ten seconds.
            await expect(came).toHaveAttribute("aria-pressed", "true");
            expect((await readBooking(page.request, booked.id)).outcome).toBe(
                null,
            );

            await page.clock.runFor(11_000);
            await expect
                .poll(
                    async () =>
                        (await readBooking(page.request, booked.id)).outcome,
                )
                .toBe("ATTENDED");

            await page.reload();
            await expect(
                page.getByRole("button", { name: "Came", exact: true }),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(
                page.getByRole("region", { name: /^Did .+ come\?$/ }),
            ).toContainText(/Came\./);
        } finally {
            await tidy(page.request, service, [booked.id]);
        }
    });

    test("Undo inside the ten seconds writes nothing", async ({
        page,
    }, testInfo) => {
        await page.clock.install();
        await signIn(page);
        const service = await ownService(page.request, testInfo, "Undo");
        const booked = await bookOnOwn(page.request, service, {
            name: `Undo ${stamp(testInfo)}`,
            phone: phone(),
        });
        try {
            await page.goto(`/bookings/${booked.id}`);
            const came = page.getByRole("button", {
                name: "Came",
                exact: true,
            });
            await came.click();
            await expect(came).toHaveAttribute("aria-pressed", "true");
            // The card's own Undo, beside Came (the toast has one too).
            await page
                .getByRole("region", { name: /^Did .+ come\?$/ })
                .getByRole("button", { name: "Undo" })
                .click();
            await expect(came).toHaveAttribute("aria-pressed", "false");

            const sent: string[] = [];
            page.on("request", (r) => {
                if (r.method() !== "GET") sent.push(r.url());
            });
            await page.clock.runFor(11_000);
            expect(sent).toEqual([]);
            expect((await readBooking(page.request, booked.id)).outcome).toBe(
                null,
            );

            await page.reload();
            await expect(
                page.getByRole("button", { name: "Came", exact: true }),
            ).toHaveAttribute("aria-pressed", "false");
            await expect(
                page.getByRole("region", { name: /^Did .+ come\?$/ }),
            ).toContainText("Nobody has marked it yet.");
        } finally {
            await tidy(page.request, service, [booked.id]);
        }
    });

    test("cancels a booking paid at the desk: held ten seconds, then cancelled", async ({
        page,
    }, testInfo) => {
        await page.clock.install();
        await signIn(page);
        const service = await ownService(page.request, testInfo, "Cancel");
        // Two steps ahead: a booking still to come, paid at the desk.
        const booked = await bookOnOwn(
            page.request,
            service,
            { name: `Cash ${stamp(testInfo)}`, phone: phone() },
            {
                startAt: new Date(
                    (Math.floor(Date.now() / STEP_MS) + 4) * STEP_MS,
                ).toISOString(),
                paidBy: "CASH",
            },
        );
        try {
            expect(
                (await readBooking(page.request, booked.id)).money
                    ?.paidAtDeskCents,
            ).toBe(service.priceCents);
            await page.goto(`/bookings/${booked.id}`);
            await more(page).click();
            await page.getByRole("button", { name: "Cancel booking" }).click();
            const sheet = page.getByRole("dialog", {
                name: /^Cancel .+'s booking\?$/,
            });
            await expect(sheet).toBeVisible();
            // Money taken at the desk is the desk's to hand back: no
            // online refund to choose.
            await expect(
                sheet.getByRole("radio", { name: /^Refund / }),
            ).toHaveCount(0);
            await sheet
                .getByRole("button", { name: "Cancel booking", exact: true })
                .click();
            await expect(
                page.getByText("Cancelling in 10 seconds").first(),
            ).toBeVisible();
            expect((await readBooking(page.request, booked.id)).status).toBe(
                "CONFIRMED",
            );
            await page.clock.runFor(11_000);
            await expect
                .poll(
                    async () =>
                        (await readBooking(page.request, booked.id)).status,
                )
                .toBe("CANCELLED");
            // What was paid stays on the record.
            expect(
                (await readBooking(page.request, booked.id)).money
                    ?.paidAtDeskCents,
            ).toBe(service.priceCents);
        } finally {
            await tidy(page.request, service, [booked.id]);
        }
    });

    test("a booking paid online is cancelled with the refund choice; Keep booking leaves it", async ({
        page,
    }) => {
        await useSession(page, "owner");
        const found = await paidOnlineBooking(page.request);
        expect(
            found,
            "a showcase business has an upcoming booking paid online",
        ).toBeTruthy();
        if (!found) return;
        await page.goto(`/open/${found.org}`);
        await page.goto(`/bookings/${found.id}`);
        await more(page).click();
        await page.getByRole("button", { name: "Cancel booking" }).click();
        const sheet = page.getByRole("dialog", {
            name: /^Cancel .+ booking\?$/,
        });
        await expect(sheet).toBeVisible();
        // The policy first, then Refund ₹X or Keep the payment, one of them
        // picked by the policy, and the button says which.
        const refund = sheet.getByRole("radio", { name: /^Refund ₹/ });
        const keep = sheet.getByRole("radio", {
            name: /^Keep the (payment|deposit)/,
        });
        await expect(refund).toBeVisible();
        await expect(keep).toBeVisible();
        await expect(sheet.getByRole("radio", { checked: true })).toHaveCount(
            1,
        );
        await expect(
            sheet.locator('[data-overlay-foot] button[type="submit"]'),
        ).toHaveText(
            /^Cancel and refund ₹|^Cancel, keep the (payment|deposit)$/,
        );
        // A film set: nothing is cancelled here.
        await sheet.getByRole("button", { name: "Keep booking" }).click();
        await expect(sheet).toBeHidden();
        const after = await page.request.get(
            `${urls.API_URL}/organizations/${found.org}/services/bookings/${found.id}`,
            { headers: { "x-organization-id": found.org } },
        );
        expect(((await after.json()) as BookingRead).status).toBe("CONFIRMED");
    });
});

/**
 * An upcoming booking paid online, with money still to refund, on one of
 * the showcase businesses the demo owner runs: read only.
 */
async function paidOnlineBooking(
    request: APIRequestContext,
): Promise<{ org: string; id: string } | null> {
    const orgs = (await (
        await request.get(`${urls.API_URL}/organizations`)
    ).json()) as { id: string }[];
    const from = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const to = new Date(Date.now() + 21 * 86_400_000).toISOString();
    for (const { id: org } of orgs.filter((o) => o.id.startsWith("seed_sc_"))) {
        const headers = { "x-organization-id": org };
        const api = (path: string) =>
            `${urls.API_URL}/organizations/${org}${path}`;
        const res = await request.get(
            api(`/services/bookings?from=${from}&to=${to}`),
            { headers },
        );
        if (!res.ok()) continue;
        const { diaries } = (await res.json()) as {
            diaries: {
                bookings: {
                    id: string;
                    status: string;
                    paidWith: string | null;
                }[];
            }[];
        };
        const paid = diaries
            .flatMap((d) => d.bookings)
            .filter((b) => b.status === "CONFIRMED" && b.paidWith === "PAID")
            .slice(0, 10);
        for (const b of paid) {
            const one = await request.get(api(`/services/bookings/${b.id}`), {
                headers,
            });
            if (!one.ok()) continue;
            const m = ((await one.json()) as BookingRead).money;
            if (
                m &&
                m.paidOnlineCents > 0 &&
                !m.refund &&
                !m.treatmentOrderId &&
                (m.refundableCents ?? m.paidOnlineCents) > 0
            ) {
                return { org, id: b.id };
            }
        }
    }
    return null;
}
