// @covers accounts:/login app:/open app:/bookings app:/bookings/all app:/bookings/[bookingId] app:/bookings/availability app:/services app:/services/new app:/customers app:/contacts api:bookings api:staff api:customer-workspace api:contacts
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import {
    phone as aPhone,
    aService,
    bookOwn,
    makeContact,
    northwind,
    stamp as ownStamp,
} from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { asOwner, openNorthwindAs } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The bookings calendar and its editors (U15, U16), read on Pulse Fitness,
 * the showcase gym: nothing is saved there. Held changes are undone before
 * the page closes (leaving would send them).
 *
 * What saves — an allergy on a booked customer, extra hours and a booking
 * into them, a new service — does it on Northwind, on a customer, booking,
 * staff member or service the test makes for itself.
 */

const ORG = "seed_sc_pulse_org";
const NORTHWIND = "seed_org";
const orgHeader = { "x-organization-id": ORG, origin: urls.APP_URL };
const api = (path: string) => `${urls.API_URL}/organizations/${ORG}${path}`;
const IST_OFFSET_MS = 330 * 60_000;

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${ORG}`);
}

/**
 * Northwind as a diary of one: its "E2E Diary" staff member, taking one of
 * the seed's services, with no weekly hours (so every hour is closed). One
 * an earlier run archived is brought back rather than another made.
 */
async function diaryOfOne(request: APIRequestContext): Promise<{
    id: string;
    name: string;
    service: { id: string; name: string };
}> {
    const nw = northwind(request);
    const name = "E2E Diary";
    const service = await aService(request);
    const { staff } = await nw.get<{
        staff: { id: string; name: string }[];
    }>("/staff");
    const found = staff.find((p) => p.name === name);
    if (found) {
        await nw.patch(`/staff/${found.id}`, { status: "ACTIVE" });
        await nw.put(`/staff/${found.id}/services`, {
            serviceIds: [service.id],
        });
        return { id: found.id, name, service };
    }
    const made = await nw.post<{ id: string }>("/staff", {
        name,
        serviceIds: [service.id],
    });
    return { id: made.id, name, service };
}

interface Staff {
    id: string;
    name: string;
    hours: { dayOfWeek: number; startMinute: number; endMinute: number }[];
    timeOff: { id: string }[];
}

/**
 * A person of this test's own on Northwind's diary for Hours and time off
 * (U17), one per project so the desk and phone runs never share a week:
 * Monday to Saturday 9 am to 6 pm, no time off, active. One an earlier run
 * archived is brought back and reset rather than another made.
 */
async function hoursPerson(
    request: APIRequestContext,
    who = "owner",
): Promise<{ id: string; name: string; first: string }> {
    const nw = northwind(request);
    const project = test.info().project.name.replace(/[^A-Za-z]/g, "");
    const first = `Hours${who === "owner" ? "" : "M"}${project}`;
    const name = `${first} E2E`;
    const hours = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: 540,
        endMinute: 1080,
    }));
    const { staff } = await nw.get<{ staff: Staff[] }>("/staff");
    const found = staff.find((p) => p.name === name);
    const id = found
        ? found.id
        : (await nw.post<{ id: string }>("/staff", { name, hours })).id;
    if (found) {
        await nw.patch(`/staff/${id}`, { status: "ACTIVE" });
        await nw.put(`/staff/${id}/hours`, { hours });
        if (found.timeOff.length) {
            await nw.post(`/staff/${id}/time-off/remove`, {
                ids: found.timeOff.map((t) => t.id),
            });
        }
    }
    return { id, name, first };
}

/**
 * Two days, in India, on which `serviceId` runs by its own weekly rules,
 * `after` days ahead or later: the desk books into the first, the phone into
 * the second. A one-to-one start is the person's hours intersected with the
 * service's rules (ADR-008), so hours opened on a day the service does not
 * run offer it nothing — Northwind's seeded services run Mon–Fri, and a
 * fixed "three days ahead" was a Saturday every Wednesday.
 */
async function serviceDays(
    request: APIRequestContext,
    serviceId: string,
    after: number,
): Promise<[string, string]> {
    const rules = await northwind(request).get<{ dayOfWeek: number }[]>(
        `/services/${serviceId}/rules`,
    );
    const runs = new Set(rules.map((r) => r.dayOfWeek));
    expect(
        runs.size,
        "the service runs on some day of the week",
    ).toBeGreaterThan(0);
    const days: string[] = [];
    for (let d = after; days.length < 2; d++) {
        const day = istDay(d);
        if (runs.has(new Date(`${day}T00:00:00Z`).getUTCDay())) days.push(day);
    }
    return [days[0], days[1]];
}

/** "YYYY-MM-DD" in India, `days` from today. */
function istDay(days: number): string {
    return new Date(Date.now() + IST_OFFSET_MS + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
}

interface Diary {
    person: { id: string; name: string } | null;
    bookings: {
        id: string;
        status: string;
        outcome: string | null;
        bookerName: string | null;
        bookerPhone: string | null;
        startAt: string;
        contact: { id: string; firstName: string | null } | null;
    }[];
}

/** Open a booking's peek from the agenda of its day. */
async function openPeek(
    page: Page,
    booking: { startAt: string; bookerName: string | null },
) {
    const day = new Date(Date.parse(booking.startAt) + IST_OFFSET_MS)
        .toISOString()
        .slice(0, 10);
    await page.goto(`/bookings?date=${day}&layout=agenda`);
    await page
        .getByRole("button", { name: new RegExp(booking.bookerName ?? "") })
        .first()
        .click();
    return page.getByRole("dialog");
}

async function diaries(request: APIRequestContext, from: string, to: string) {
    const res = await request.get(
        api(`/services/bookings?from=${from}&to=${to}`),
        { headers: orgHeader },
    );
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { diaries: Diary[] }).diaries;
}

test.describe("bookings calendar", () => {
    test("header C: the date opens Go to a day, and Show as changes the view", async ({
        page,
    }) => {
        await signIn(page);
        // The view named in the address: what this person starts on is
        // theirs (DEC-170), and this spec never changes it.
        await page.goto("/bookings?layout=day");
        const title = page.getByRole("button", {
            name: /^Today, .+\. Change the day or the view$/,
        });
        await expect(title).toBeVisible();
        const sheet = page.getByRole("dialog", { name: "Go to a day" });
        // A press before the calendar hydrates is lost on CI's slower phone
        // runs: press until the sheet answers (`fixtures/press.ts`).
        await pressUntil(title, sheet);
        // Day, Week and List live under Show as, and nowhere else.
        const views = sheet.getByRole("navigation", { name: "Bookings view" });
        await expect(views.getByRole("link", { name: "Day" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        await views.getByRole("link", { name: "Week" }).click();
        await expect(page).toHaveURL(/layout=week/);
        await expect(
            page.getByRole("button", {
                name: /^This week, .+\. Change the day or the view$/,
            }),
        ).toBeVisible();
        await page.goto("/bookings?layout=agenda");
        await page
            .getByRole("button", { name: /Change the day or the view$/ })
            .click();
        await expect(
            page
                .getByRole("dialog", { name: "Go to a day" })
                .getByRole("navigation", { name: "Bookings view" })
                .getByRole("link", { name: "List" }),
        ).toHaveAttribute("aria-current", "page");
        // The standing sentence under the diary is gone.
        await expect(page.getByText(/Customers can book/)).toHaveCount(0);
    });

    test("the … sheet holds cancelled, All bookings, hours and what the colours mean", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/bookings?layout=day");
        // No colour key row over the diary any more: it is in the sheet.
        await expect(page.getByRole("list", { name: "Key" })).toHaveCount(0);
        await page.getByRole("button", { name: /^This day:/ }).click();
        const sheet = page.getByRole("dialog", { name: "This day" });
        await expect(
            sheet.getByRole("switch", { name: "Show cancelled bookings" }),
        ).toBeVisible();
        await expect(
            sheet.getByRole("link", { name: "All bookings" }),
        ).toBeVisible();
        // "Hours and time off" for Everyone, "Meera's hours and time off"
        // for one person.
        await expect(
            sheet.getByRole("link", { name: /hours and time off$/i }),
        ).toBeVisible();
        await expect(sheet.getByText("What the colours mean")).toBeVisible();
        await expect(
            sheet.getByRole("radiogroup", { name: "Start Bookings on" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await page.goto("/bookings?layout=week");
        await expect(
            page
                .getByRole("status")
                .filter({ hasText: /booked/ })
                .first(),
        ).toBeVisible();
    });

    test("the week: counts and fullness per day, the phone's strip agrees with its list (U5)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/bookings?layout=week");
        if (test.info().project.name.startsWith("phone")) {
            const strip = page.getByRole("radiogroup", {
                name: "Pick a day of the week",
            });
            await expect(strip.getByRole("radio")).toHaveCount(7);
            // Wednesday: picked at once, kept in the address, and the
            // list's count is the strip's.
            const wed = strip.getByRole("radio", { name: /^Wed / });
            await wed.click();
            await expect(wed).toHaveAttribute("aria-checked", "true");
            await expect(page).toHaveURL(/layout=week/);
            const label = (await wed.getAttribute("aria-label")) ?? "";
            const date = label.split(",")[0] ?? "";
            await expect(page).toHaveURL(
                new RegExp(
                    `date=\\d{4}-\\d{2}-${date.split(" ")[1]?.padStart(2, "0")}`,
                ),
            );
            await expect(
                page.getByRole("heading", {
                    level: 2,
                    name: new RegExp(`^${date}`),
                }),
            ).toBeVisible();
            const n = /(\d+) booking/.exec(label)?.[1];
            if (n !== undefined) {
                await expect(
                    page.getByText(new RegExp(`^${n} bookings?( · |$)`)),
                ).toBeVisible();
            } else {
                await expect(
                    page.getByText("Closed", { exact: true }),
                ).toBeVisible();
            }
            // The 880px grid never draws on a phone, and nothing hides
            // sideways.
            await expect(
                page
                    .getByRole("button", { name: /Open the day$/ })
                    .filter({ visible: true }),
            ).toHaveCount(0);
            await expectNothingHiddenSideways(page);
        } else {
            const headings = page
                .getByRole("button", { name: /Open the day$/ })
                .filter({ visible: true });
            await expect(headings).toHaveCount(7);
            await expect(headings.first()).toHaveAccessibleName(
                /^Mon \d+ \w+(, today)?, (closed|\d+ booked)/,
            );
            await expect(
                page.getByText(/The bar under each day shows how full it is\./),
            ).toBeVisible();
            await headings.nth(2).click();
            await expect(page).toHaveURL(/layout=day/);
        }
    });

    test("the peek shows Needs attention and opens the customer's page", async ({
        page,
    }, testInfo) => {
        // On Northwind, with a customer and a booking of its own: an allergy
        // added to one of Pulse's members would be on a film set.
        await useSession(page);
        await page.goto(`/open/${NORTHWIND}`);
        const s = ownStamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Peek",
            lastName: s,
            email: `peek-${s}@example.test`,
        });
        const booked = await bookOwn(page.request, who.id);
        try {
            await northwind(page.request).post(
                `/customers/${who.id}/attention`,
                {
                    kind: "ALLERGY",
                    label: "E2E sesame",
                },
            );
            const sheet = await openPeek(page, {
                startAt: booked.startAt,
                bookerName: who.name,
            });
            await expect(sheet.getByText("Needs attention")).toBeVisible();
            await expect(sheet.getByText(/Allergy: E2E sesame/)).toBeVisible();
            // Their page is under More (U7).
            await sheet.getByRole("button", { name: "More" }).click();
            await page.getByRole("link", { name: /^Open .+'s page$/ }).click();
            await expect(page).toHaveURL(new RegExp(`/contacts/${who.id}`));
        } finally {
            // Its time, back for everyone else.
            await northwind(page.request).delete(
                `/services/bookings/${booked.id}`,
            );
        }
    });

    test("a booking with no phone says where to add one", async ({
        page,
    }, testInfo) => {
        // On Northwind, with a customer of its own who has no phone and a
        // booking for them: the seed's phones are not this test's to rely on.
        await useSession(page);
        await page.goto(`/open/${NORTHWIND}`);
        const s = ownStamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Nophone",
            lastName: s,
            email: `nophone-${s}@example.test`,
        });
        const booked = await bookOwn(page.request, who.id);
        try {
            const sheet = await openPeek(page, {
                startAt: booked.startAt,
                bookerName: who.name,
            });
            await expect(
                sheet.getByText("No phone yet. Add it on their page"),
            ).toBeVisible();
        } finally {
            await northwind(page.request).delete(
                `/services/bookings/${booked.id}`,
            );
            await northwind(page.request).delete(`/contacts/${who.id}`);
        }
    });

    test("cancel from the quick look, then Undo: nothing is sent", async ({
        page,
    }, testInfo) => {
        // A booking of its own on Northwind, with nothing paid: the cancel
        // asks no money question and waits ten seconds with Undo (U3, U7).
        // The page's own clock, so the hold can be run out rather than
        // slept through. Installed before the page loads; it keeps time.
        await page.clock.install();
        await useSession(page);
        await page.goto(`/open/${NORTHWIND}`);
        const s = ownStamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Cancel",
            lastName: s,
            email: `cancel-${s}@example.test`,
        });
        const booked = await bookOwn(page.request, who.id);
        try {
            const sheet = await openPeek(page, {
                startAt: booked.startAt,
                bookerName: who.name,
            });
            await sheet.getByRole("button", { name: "Move or cancel" }).click();
            await expect(
                sheet.getByRole("heading", { name: /^Change .+'s booking\?$/ }),
            ).toBeVisible();
            await sheet.getByRole("button", { name: "Cancel booking" }).click();
            const cancel = page.getByRole("dialog", {
                name: /^Cancel .+'s booking\?$/,
            });
            await cancel
                .getByRole("button", { name: "Cancel booking", exact: true })
                .click();
            // The quick look closes; the toast holds the Undo.
            await page.getByRole("button", { name: "Undo" }).click();

            const sent: string[] = [];
            page.on("request", (r) => {
                if (r.method() !== "GET") sent.push(r.url());
            });
            await page.clock.runFor(11_000);
            expect(sent).toEqual([]);
            const after = await northwind(page.request).get<{
                status: string;
            }>(`/services/bookings/${booked.id}`);
            expect(after.status).toBe("CONFIRMED");
        } finally {
            await northwind(page.request).delete(
                `/services/bookings/${booked.id}`,
            );
        }
    });

    test("the quick look moves a booking to another free time (U7)", async ({
        page,
    }, testInfo) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND}`);
        const s = ownStamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Move",
            lastName: s,
            email: `move-${s}@example.test`,
        });
        const booked = await bookOwn(page.request, who.id);
        try {
            const sheet = await openPeek(page, {
                startAt: booked.startAt,
                bookerName: who.name,
            });
            await expect(
                sheet.getByText("Booked", { exact: true }),
            ).toBeVisible();
            await sheet.getByRole("button", { name: "Move or cancel" }).click();
            await sheet
                .getByRole("button", { name: "Move to another time" })
                .click();
            await expect(
                sheet.getByRole("heading", { name: /^Move .+'s booking$/ }),
            ).toBeVisible();
            await expect(
                sheet.getByRole("button", { name: "Pick a new time" }),
            ).toBeDisabled();
            // Any free time the picker offers on the day it opens on, or the
            // next free day.
            const next = sheet.getByRole("button", { name: /^Next free day/ });
            if (await next.isVisible().catch(() => false)) await next.click();
            await sheet
                .getByRole("radio", { name: /^\d{1,2}:\d{2} (am|pm)/ })
                .first()
                .click();
            await sheet.getByRole("button", { name: /^Move to / }).click();
            await expect(page.getByText(/^Moved .+ to /)).toBeVisible();
            const after = await northwind(page.request).get<{
                startAt: string;
            }>(`/services/bookings/${booked.id}`);
            expect(after.startAt).not.toBe(booked.startAt);
            await expectNothingHiddenSideways(page);
        } finally {
            await northwind(page.request).delete(
                `/services/bookings/${booked.id}`,
            );
        }
    });

    // @serial: Northwind takes bookings without a team, so this makes it a
    // diary of one for the test (a staff member it archives again), which
    // every booking test beside it would otherwise see.
    test(
        "open extra hours on a closed stretch, then book into the new gap",
        {
            tag: "@serial",
        },
        async ({ page }) => {
            test.setTimeout(120_000);
            await useSession(page);
            await page.goto(`/open/${NORTHWIND}`);
            const nw = northwind(page.request);
            const person = await diaryOfOne(page.request);
            // A day per project: the desk run leaves its cancelled booking
            // drawn on its day, over the closed time the phone would open.
            // Both are days the service runs, whatever today is.
            const [deskDay, phoneDay] = await serviceDays(
                page.request,
                person.service.id,
                2,
            );
            const day = test.info().project.name.startsWith("phone")
                ? phoneDay
                : deskDay;
            // Digits: the form capitalises each word of a new name.
            const customer = `E2E Walk-in ${Date.now()}`;

            let bookingId: string | null = null;
            let contactId: string | null = null;
            try {
                // Day, named: a phone with no view chosen opens on List (Q4).
                await page.goto(`/bookings?date=${day}&layout=day`);
                // Closed time says "Closed · click to open" (a phone: tap)
                // and opens from the half hour pressed (U4).
                await page
                    .getByRole("button", {
                        name: new RegExp(
                            `^Closed .*\\. Open these hours for ${person.name}`,
                        ),
                    })
                    .filter({ visible: true })
                    .first()
                    .click({ position: { x: 40, y: 300 } });
                // Open closed time (U10): how long from the half hour
                // pressed, just this day by default, one Open button.
                const dialog = page.getByRole("dialog", {
                    name: `Open ${person.name.split(" ")[0]}'s closed time`,
                });
                await expect(dialog).toBeVisible();
                const lengths = dialog.getByRole("radiogroup", {
                    name: /^How long, from /,
                });
                const at = /from (\d{1,2}:\d\d [ap]m)/.exec(
                    // textContent: the eyebrow is drawn in capitals.
                    (await dialog
                        .getByText(/^How long, from /)
                        .textContent()) ?? "",
                )?.[1];
                // Two hours: room for the service to start in it (an hour
                // left only a 45-minute gap from 2:15, too short).
                await lengths.getByRole("radio", { name: "2 hours" }).click();
                await expect(
                    lengths.getByRole("radio", { name: "2 hours" }),
                ).toBeChecked();
                await expect(
                    dialog.getByRole("radio", { name: /^Just / }),
                ).toBeChecked();
                const open = dialog.getByRole("button", {
                    name: /^Open \d{1,2}:\d\d/,
                });
                await expect(open).toBeEnabled();
                await open.click();
                await expect(dialog).toBeHidden();
                await expect(
                    page.getByText(/^Opened .* for /).first(),
                ).toBeVisible();

                // The new hours may join hours next to them: find the free gap
                // that holds the time just opened.
                // "9:30 am": the 12-hour clock, read back as minutes.
                const mins = (t: string) => {
                    const [clock = "", period] = t.split(" ");
                    const [h = "0", m = "0"] = clock.split(":");
                    return (
                        ((Number(h) % 12) + (period === "pm" ? 12 : 0)) * 60 +
                        Number(m)
                    );
                };
                // "Free 9:00 to 10:00 am with E2E Diary. Book or block" (U4).
                const gaps = page.getByRole("button", {
                    name: new RegExp(
                        `^Free .* with ${person.name}\\. Book or block$`,
                    ),
                });
                // The toast can land before the diary redraws, so wait for the gap.
                const holding = async () =>
                    (
                        await gaps.evaluateAll((els) =>
                            els.map((e) => e.getAttribute("aria-label") ?? ""),
                        )
                    ).findIndex((l) => {
                        const [, a0 = "", p0 = "", b0 = "", p1 = ""] =
                            /^Free (\d{1,2}:\d\d)(?: ([ap]m))? to (\d{1,2}:\d\d) ([ap]m)/.exec(
                                l,
                            ) ?? [];
                        const a = `${a0} ${p0 === "" ? p1 : p0}`;
                        const b = `${b0} ${p1}`;
                        return (
                            at !== undefined &&
                            mins(a) <= mins(at) &&
                            mins(at) < mins(b)
                        );
                    });
                await expect.poll(holding).toBeGreaterThanOrEqual(0);
                const index = await holding();
                await gaps.nth(index).click();
                // The free-time sheet (U9): Book someone · Block this time
                // at the top; in extra hours, Close these extra hours at
                // the foot (Q11). Neither is saved here.
                const book = page.getByRole("dialog");
                await expect(book).toContainText("Free until");
                await book
                    .getByRole("radio", { name: "Block this time" })
                    .click();
                await expect(
                    book.getByRole("button", { name: /^Block \d/ }),
                ).toBeVisible();
                await expect(
                    book.getByRole("button", {
                        name: "Close these extra hours",
                    }),
                ).toBeVisible();
                await book.getByRole("radio", { name: "Book someone" }).click();
                await expect(
                    book.getByText("Finding when each can start…"),
                ).toBeHidden();
                // Step 1: a service that fits.
                const chip = book
                    .getByRole("radiogroup", { name: "Service" })
                    .locator("button[role=radio]:not([disabled])")
                    .first();
                await expect(chip).toBeVisible();
                await chip.click();
                const next = book.locator(
                    '[data-overlay-foot] button[type="submit"]',
                );
                await expect(next).toHaveText("Next: who it’s for");
                await next.click();
                // Step 2: the shared customer step, a name and a phone.
                await book.getByLabel("Find the customer").fill(customer);
                await book
                    .getByRole("button", {
                        name: new RegExp(
                            `^Add \u201c${customer}\u201d as a new customer`,
                        ),
                    })
                    .click();
                await expect(book.getByLabel("Name")).toHaveValue(customer);
                await book
                    .getByLabel("Phone")
                    .fill(`90${String(Date.now()).slice(-8)}`);
                await book.getByRole("button", { name: "Add and use" }).click();
                // Step 3: check, Pays at the visit by default, Book.
                await expect(
                    book.getByRole("radio", { name: /^Pays at the visit/ }),
                ).toBeChecked();
                await next.click();
                await expect(
                    book.getByRole("heading", {
                        name: `${customer} is booked`,
                    }),
                ).toBeVisible();
                await expect(
                    book.getByRole("link", { name: "WhatsApp" }),
                ).toHaveAttribute("href", /^https:\/\/wa\.me\//);
                await expect(
                    book.getByRole("button", { name: "Copy message" }),
                ).toBeVisible();
                await book.getByRole("button", { name: "Done" }).click();

                // The whole of the booked day, in India.
                const from = new Date(`${day}T00:00:00+05:30`).toISOString();
                const to = new Date(
                    Date.parse(from) + 86_400_000,
                ).toISOString();
                const made = (
                    await nw.get<{ diaries: Diary[] }>(
                        `/services/bookings?from=${from}&to=${to}`,
                    )
                ).diaries
                    .flatMap((d) => d.bookings)
                    .find((b) => b.bookerName === customer);
                expect(made).toBeTruthy();
                bookingId = made?.id ?? null;
                contactId = made?.contact?.id ?? null;
            } finally {
                // Northwind as it was: the booking, its customer, the hours, and
                // no team.
                if (bookingId)
                    await nw.delete(`/services/bookings/${bookingId}`);
                if (contactId) await nw.delete(`/contacts/${contactId}`);
                const now = await nw.get<{ extraHours: { id: string }[] }>(
                    `/staff/${person.id}`,
                );
                for (const x of now.extraHours) {
                    await nw.delete(`/staff/${person.id}/extra-hours/${x.id}`);
                }
                await nw.delete(`/staff/${person.id}`);
            }
        },
    );
});

test.describe("the List (U6)", () => {
    test("a booked day: rows open a quick look, free times book, nothing scrolls sideways", async ({
        page,
    }) => {
        await signIn(page);
        // A day of Pulse's with a booking on it, read from the API.
        const from = new Date(Date.now() - 86_400_000).toISOString();
        const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
        const found = (await diaries(page.request, from, to))
            .filter((d) => d.person)
            .flatMap((d) => d.bookings)
            .find((b) => b.status === "CONFIRMED" && b.bookerName);
        // Pulse is the showcase gym: its seed books every fortnight. None
        // is a broken seed, not a reason to pass.
        expect(
            found,
            "Pulse has a one-to-one booking in the fortnight",
        ).toBeTruthy();
        if (!found) return;
        const day = new Date(Date.parse(found.startAt) + IST_OFFSET_MS)
            .toISOString()
            .slice(0, 10);
        await page.goto(`/bookings?date=${day}&layout=agenda`);

        const booked = page.getByRole("region", { name: "Booked" });
        await expect(booked).toBeVisible();
        await booked
            .getByRole("button", { name: new RegExp(found.bookerName ?? "") })
            .first()
            .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");

        const free = page.getByRole("region", { name: "Free times" });
        await expect(free).toBeVisible();
        const phone = test.info().project.name.startsWith("phone");
        if (phone) {
            // A card that opens; each time a 48px row.
            const toggle = free.locator("button[aria-expanded]");
            if ((await toggle.count()) > 0) {
                await toggle.click();
                await expect(toggle).toHaveAttribute("aria-expanded", "true");
                const row = free
                    .getByRole("button", { name: /^Book / })
                    .first();
                const box = await row.boundingBox();
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
            }
        } else {
            await expect(
                free.getByRole("heading", { name: /free times?$/ }),
            ).toBeVisible();
        }
        const rows = free.getByRole("button", { name: /^Book / });
        if ((await rows.count()) > 0) {
            // The free-time sheet opens on it; nothing is saved here.
            await rows.first().click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.keyboard.press("Escape");
        }

        const view = await page.evaluate(() => ({
            vw: window.innerWidth,
            scroll: document.documentElement.scrollWidth,
        }));
        expect(view.scroll).toBeLessThanOrEqual(view.vw);
    });

    test("a day with nothing booked says closed, or offers Book on this day", async ({
        page,
    }) => {
        await signIn(page);
        // Far ahead, so nothing is booked yet: a Sunday and a Wednesday.
        const ahead = (weekday: number) => {
            for (let d = 120; ; d++) {
                const day = istDay(d);
                if (new Date(`${day}T00:00:00Z`).getUTCDay() === weekday)
                    return day;
            }
        };
        for (const day of [ahead(0), ahead(3)]) {
            await page.goto(`/bookings?date=${day}&layout=agenda`);
            const closed = page.getByRole("heading", { name: /^Closed on / });
            const quiet = page.getByRole("heading", {
                name: /^Nothing booked on /,
            });
            await expect(closed.or(quiet)).toBeVisible();
            if (await closed.isVisible()) {
                await expect(
                    page.getByRole("button", {
                        name: "Open hours on this day",
                    }),
                ).toBeVisible();
            } else {
                const book = page.getByRole("button", {
                    name: "Book on this day",
                });
                await expect(book).toBeVisible();
                await pressUntil(
                    book,
                    page.getByRole("dialog", { name: "New booking" }),
                );
                // New booking opens on Who; its day is the one pressed, as
                // its When step shows: walked to, and that day picked.
                const sheet = page.getByRole("dialog", { name: "New booking" });
                const foot = sheet.locator(
                    '[data-overlay-foot] button[type="submit"]',
                );
                await sheet
                    .getByRole("list", { name: "Recent customers" })
                    .getByRole("button")
                    .first()
                    .click();
                await foot.click();
                await sheet
                    .getByRole("radiogroup", { name: "Service" })
                    .getByRole("radio")
                    .first()
                    .click();
                await foot.click();
                const when = sheet
                    .getByText("Step 4 of 5 · Day and time")
                    .filter({ visible: true })
                    .first();
                const withWho = sheet
                    .getByText(/^Step 3 of 5/)
                    .filter({ visible: true })
                    .first();
                await expect(when.or(withWho)).toBeVisible();
                if (await withWho.isVisible()) await foot.click();
                await expect(when).toBeVisible();
                const n = Number(day.slice(8, 10));
                await expect(
                    sheet.getByRole("radio", {
                        checked: true,
                        name: new RegExp(`^\\w{3} ${n} \\w{3}\\b`),
                    }),
                ).toBeVisible();
            }
        }
    });

    test("a phone with no view chosen opens on List", async ({
        page,
        context,
    }) => {
        test.skip(
            !test.info().project.name.startsWith("phone"),
            "The desk opens where it was left, Day at first.",
        );
        await signIn(page);
        await context.clearCookies({ name: "saroh_bookings_view" });
        await page.goto("/bookings");
        await expect(page).toHaveURL(/layout=agenda/);
        await expect(
            page.getByRole("region", { name: "Free times" }).or(
                page.getByRole("heading", {
                    name: /^(Closed on|Nothing booked)/,
                }),
            ),
        ).toBeVisible();
    });
});

test.describe("New booking finds the customer (E4)", () => {
    test("the last 4 digits of a phone find them, +91 or not, and nothing is saved", async ({
        page,
    }, testInfo) => {
        // On Northwind, with a customer of its own and a phone no other test
        // holds: nothing about the seed's phones is assumed.
        await useSession(page);
        await page.goto(`/open/${NORTHWIND}`);
        const s = ownStamp(testInfo);
        const number = aPhone();
        const made = await makeContact(page.request, {
            firstName: "Digits",
            lastName: s,
            email: `digits-${s}@example.test`,
            phone: number,
        });
        try {
            const digits = number.replace(/\D/g, "").slice(-10);

            // The search itself: the same person by +91 and without.
            const ids = async (q: string) =>
                (
                    await northwind(page.request).get<{ id: string }[]>(
                        `/contacts/search?q=${encodeURIComponent(q)}`,
                    )
                ).map((r) => r.id);
            expect(await ids(`+91 ${digits}`)).toContain(made.id);
            expect(await ids(digits)).toContain(made.id);

            // And in New booking (U8): typing the last 4 finds them, and
            // picking them moves on to what they are booking.
            await page.goto("/bookings");
            await page
                .getByRole("button", { name: "New booking", exact: true })
                .filter({ visible: true })
                .first()
                .click();
            const book = page.getByRole("dialog", { name: "New booking" });
            await book.getByLabel("Find the customer").fill(digits.slice(-4));
            const row = book
                .getByRole("list")
                .getByRole("button", { name: new RegExp(s) })
                .first();
            await expect(row).toBeVisible();
            await row.click();
            await expect(
                book
                    .getByText("Step 2 of 5 · Service")
                    .filter({ visible: true })
                    .first(),
            ).toBeVisible();
            // Nothing is written until Book: closing asks, and Discard drops it.
            await page.keyboard.press("Escape");
            await page
                .getByRole("alertdialog", { name: "Discard what you typed?" })
                .getByRole("button", { name: "Discard" })
                .click();
            await expect(book).toBeHidden();
        } finally {
            await northwind(page.request).delete(`/contacts/${made.id}`);
        }
    });
});

test.describe("availability and services", () => {
    // @serial: each project puts a person of its own on Northwind's diary
    // (archived again after), which the calendar tests beside it would see.
    test(
        "hours and time off save as they change, with Undo, and leaving never asks (U17)",
        { tag: "@serial" },
        async ({ page }) => {
            test.setTimeout(120_000);
            await useSession(page);
            await page.goto(`/open/${NORTHWIND}`);
            const person = await hoursPerson(page.request);
            const nw = northwind(page.request);
            try {
                await page.goto(`/bookings/availability?person=${person.id}`);
                await expect(
                    page.getByRole("heading", {
                        level: 1,
                        name: "Hours and time off",
                    }),
                ).toBeVisible();
                await expect(page.getByText(person.name).first()).toBeVisible();
                // No Save bar: every change saves itself.
                await expect(
                    page.getByRole("button", { name: "Save", exact: true }),
                ).toHaveCount(0);

                // Close Saturday: saved at once, and Undo puts it back.
                const saturday = page.getByRole("button", {
                    name: /^Saturday, 9 am to 6 pm/,
                });
                await saturday.click();
                const day = page.getByRole("dialog", { name: "Saturday" });
                await day
                    .getByRole("switch", { name: "Open on Saturday" })
                    .click();
                await expect(
                    page.getByText(
                        `Saturday is now closed for ${person.first}. Saved.`,
                    ),
                ).toBeVisible();
                await page.getByRole("button", { name: "Undo" }).click();
                await expect
                    .poll(async () =>
                        (await nw.get<Staff>(`/staff/${person.id}`)).hours.some(
                            (h) => h.dayOfWeek === 6,
                        ),
                    )
                    .toBe(true);
                await day.getByRole("button", { name: "Done" }).click();
                await expect(day).toBeHidden();

                // Change several days: Monday to Friday with lunch, one toast.
                await page.getByRole("button", { name: "Mon to Fri" }).click();
                const several = page.getByRole("dialog", {
                    name: "Change several days",
                });
                await several
                    .getByRole("switch", { name: "Lunch break" })
                    .click();
                await several
                    .getByRole("button", { name: "Apply to 5 days" })
                    .click();
                await expect(several).toBeHidden();
                await expect(
                    page.getByText(
                        /^Mon, Tue, Wed, Thu, Fri: 9 am to 6 pm, lunch/,
                    ),
                ).toBeVisible();
                await expect(
                    page.getByRole("button", {
                        name: /^Monday, 9 am to 6 pm, Lunch/,
                    }),
                ).toBeVisible();

                // Time off: added from its sheet, then removed with Undo there.
                await page
                    .getByRole("button", { name: "Add time off" })
                    .click();
                const off = page.getByRole("dialog", { name: "Add time off" });
                await off.getByRole("radio", { name: "Tomorrow" }).click();
                await off.getByLabel(/^Reason/).fill("E2E leave");
                await off
                    .getByRole("button", { name: "Add time off", exact: true })
                    .click();
                await expect(off).toBeHidden();
                await expect(page.getByText(/^Time off added\./)).toBeVisible();
                const line = page.getByRole("button", {
                    name: new RegExp(`^${person.first}\\s·\\s.*E2E leave`),
                });
                await line.click();
                await page
                    .getByRole("button", { name: "Remove this time off" })
                    .click();
                await expect(page.getByText("Time off removed.")).toBeVisible();
                await expect(line).toHaveCount(0);

                if (test.info().project.name.startsWith("phone")) {
                    await expectNothingHiddenSideways(page);
                }

                // Leaving never asks: there is no draft to lose. The page
                // header has no breadcrumb (U17), so leave by the menu: the
                // rail at a desk, the More sheet's Bookings group on a phone.
                if (test.info().project.name.startsWith("phone")) {
                    await page
                        .getByRole("navigation", { name: "Main" })
                        .getByRole("button", { name: /^More/ })
                        .click();
                    await page
                        .getByRole("dialog", { name: "Everything else" })
                        .getByRole("group", { name: "Bookings", exact: true })
                        .locator('a[href="/bookings"]')
                        .click();
                } else {
                    await page
                        .getByRole("navigation", { name: "Primary" })
                        .locator('a[href="/bookings"]')
                        .last()
                        .click();
                }
                await expect(page).toHaveURL(/\/bookings(\?|$)/);
                await expect(
                    page.getByRole("alertdialog", {
                        name: "Leave without saving?",
                    }),
                ).toHaveCount(0);
            } finally {
                await nw.patch(`/staff/${person.id}`, { status: "ARCHIVED" });
            }
        },
    );

    // @serial: as above, a person of the test's own on Northwind's diary.
    test(
        "a Member changes someone's day and adds their time off, and adds nobody (DEC-170)",
        { tag: "@serial" },
        async ({ page, browser }) => {
            test.setTimeout(120_000);
            const owner = await asOwner(browser);
            const person = await hoursPerson(owner.request, "member");
            const nw = northwind(owner.request);
            try {
                await openNorthwindAs(page, "northwindMember");
                await page.goto(`/bookings/availability?person=${person.id}`);
                await expect(
                    page.getByText(
                        /^As front desk you can change anyone's hours/,
                    ),
                ).toBeVisible();
                await page
                    .getByRole("button", { name: /^Monday, 9 am to 6 pm/ })
                    .click();
                await page
                    .getByRole("dialog", { name: "Monday" })
                    .getByRole("switch", { name: "Open on Monday" })
                    .click();
                await expect(
                    page.getByText(
                        `Monday is now closed for ${person.first}. Saved.`,
                    ),
                ).toBeVisible();
                await expect
                    .poll(async () =>
                        (await nw.get<Staff>(`/staff/${person.id}`)).hours.some(
                            (h) => h.dayOfWeek === 1,
                        ),
                    )
                    .toBe(false);
                await page.keyboard.press("Escape");

                await page
                    .getByRole("button", { name: "Add time off" })
                    .click();
                const off = page.getByRole("dialog", { name: "Add time off" });
                // Closing the whole business stays with owners and admins.
                await expect(
                    off.getByText("The business is closed"),
                ).toHaveCount(0);
                await off
                    .getByRole("button", { name: "Add time off", exact: true })
                    .click();
                await expect(page.getByText(/^Time off added\./)).toBeVisible();

                await page.getByRole("button", { name: /Whose hours/ }).click();
                await expect(
                    page.getByRole("button", {
                        name: "Add someone who takes bookings",
                    }),
                ).toHaveCount(0);
            } finally {
                await nw.patch(`/staff/${person.id}`, { status: "ARCHIVED" });
                await owner.close();
            }
        },
    );

    test("a class under two places is refused, and leaving asks first (E2, U16)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/services");
        // New service is one link, and a menu with New course beside it
        // once Courses is on.
        const newLink = page.getByRole("link", { name: "New service" });
        const newMenu = page.getByRole("button", { name: "New service" });
        await expect(newLink.or(newMenu).first()).toBeVisible();
        if (await newMenu.isVisible()) {
            await newMenu.click();
            await page.getByRole("menuitem", { name: "New service" }).click();
        } else {
            await newLink.first().click();
        }
        await expect(
            page.getByRole("heading", { level: 1, name: "New service" }),
        ).toBeVisible();
        // Five questions; the rest under More details (U16). A new
        // service starts one-to-one, so Visits in a package can be opened
        // (E10); a class has none.
        const visits = page.getByRole("button", {
            name: /^Visits in a package/,
        });
        // On a phone More details opens in the questions' place, and its
        // card's Edit goes back to them.
        const more = page.getByRole("button", { name: /^More details/ });
        const inDetails = async (check: () => Promise<void>) => {
            const phone = test.info().project.name.startsWith("phone");
            if (phone) await more.click();
            await check();
            if (phone) {
                await page
                    .getByRole("button", { name: "Edit", exact: true })
                    .click();
            }
        };
        await inDetails(() => expect(visits).toBeEnabled());
        await page.getByRole("radio", { name: "A group class" }).click();
        await inDetails(() => expect(visits).toBeDisabled());
        await page.getByLabel("What is it called?").fill("E2E class");
        await page.getByRole("textbox", { name: /^Price/ }).fill("0");
        const who = page.getByRole("group", { name: "Who does it?" });
        if (await who.isVisible()) {
            // With one person on the diary they are ticked already.
            const first = who.getByRole("checkbox").first();
            if ((await first.getAttribute("aria-checked")) !== "true") {
                await first.click();
            }
        }
        // A field says what is wrong once it is left, and the button stays
        // on: pressing it says the rest and goes to the first field.
        await page.getByLabel("How many places?").fill("1");
        await page.getByLabel("How many places?").blur();
        await expect(page.getByRole("alert").first()).toHaveText(
            "A class needs at least 2 places.",
        );
        await expect(
            page.getByRole("button", { name: "Add service" }),
        ).toBeEnabled();

        // The app's one leave question, as every create and edit flow asks
        // it: Stay keeps what was typed, Leave goes where the link pointed.
        // "‹ Services", over the title.
        const crumb = page
            .locator('main a[href="/services"]')
            .filter({ hasText: /^Services$/ })
            .first();
        const ask = page.getByRole("alertdialog", {
            name: "Leave without saving?",
        });
        await crumb.click();
        await expect(ask).toBeVisible();
        await expect(ask).toContainText(
            "The service isn't created yet, so nothing you've entered will be kept.",
        );
        await expect(ask.getByRole("button", { name: "Stay" })).toBeFocused();
        await ask.getByRole("button", { name: "Stay" }).click();
        await expect(ask).toBeHidden();
        await expect(page.getByLabel("What is it called?")).toHaveValue(
            "E2E class",
        );

        await crumb.click();
        await ask.getByRole("button", { name: "Leave", exact: true }).click();
        await expect(
            page.getByRole("heading", { level: 1, name: "Services" }),
        ).toBeVisible();
    });
});

test.describe("the Service Editor on Northwind (E2)", () => {
    const NORTHWIND = "seed_org";
    const nwApi = (path: string) =>
        `${urls.API_URL}/organizations/${NORTHWIND}${path}`;

    test("an Either service with a price is added, and its row says so", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        await page.goto("/services/new");
        const heading = page.getByRole("heading", {
            level: 1,
            name: "New service",
        });
        // Northwind takes bookings in the seed: no editor is a failure,
        // never a reason to pass.
        await expect(heading).toBeVisible();
        const name = `E2E either ${ownStamp(test.info())}`;
        await page.getByLabel("What is it called?").fill(name);
        // Where is under More details, in a panel of its own (U16); on a
        // phone More details opens first.
        const more = page.getByRole("button", { name: /^More details/ });
        if (await more.isVisible()) await more.click();
        await page.getByRole("button", { name: /^Where/ }).click();
        const where = page.getByRole("dialog", { name: "Where" });
        await where.getByRole("radio", { name: "Either, they choose" }).click();
        await where
            .getByLabel("Link to join")
            .fill("https://meet.example.com/e2e-either");
        await where.getByRole("button", { name: "Use this" }).click();
        await expect(where).toBeHidden();
        if (await more.isVisible()) {
            // Back to the five questions.
            await page
                .getByRole("button", { name: "Edit", exact: true })
                .click();
        }
        await page.getByRole("textbox", { name: /^Price/ }).fill("500");
        const who = page.getByRole("group", { name: "Who does it?" });
        if (await who.isVisible()) {
            // With one person on the diary they are ticked already.
            const first = who.getByRole("checkbox").first();
            if ((await first.getAttribute("aria-checked")) !== "true") {
                await first.click();
            }
        }
        await page.getByRole("button", { name: "Add service" }).click();
        await page.waitForURL(/\/services\/(?!new)[^/]+$/);
        const id = new URL(page.url()).pathname.split("/").pop() ?? "";
        try {
            await expect(
                page.getByRole("heading", { level: 1, name }),
            ).toBeVisible();
            await expect(
                // Who can book it, in the Services list's words (U16).
                page.getByText("Customers and team", { exact: true }),
            ).toBeVisible();

            await page.goto("/services");
            // A row of the list: a table's row at the desk, a list item
            // on a phone. Taking bookings is a switch on it, on for a
            // service just added.
            const row = page
                .locator("[data-service-row], li")
                .filter({ hasText: name })
                .filter({ visible: true });
            await expect(row).toContainText("in person or online");
            await expect(
                row.getByRole("switch", { name: `Taking bookings, ${name}` }),
            ).toBeChecked();
        } finally {
            await page.request.delete(nwApi(`/services/${id}`), {
                headers: { "x-organization-id": NORTHWIND },
            });
        }
    });
});

test.describe("All bookings (U11)", () => {
    test("views are chips with counts, search and More filters narrow, nothing scrolls sideways", async ({
        page,
    }) => {
        // Read on Pulse: nothing is saved.
        await signIn(page);
        await page.goto("/bookings/all");
        await expect(
            page.getByRole("heading", { level: 1, name: "All bookings" }),
        ).toBeVisible();
        const views = page.getByRole("radiogroup", { name: "Show" });
        await expect(
            views.getByRole("radio", { name: /^Upcoming\s*\d+$/ }),
        ).toHaveAttribute("aria-checked", "true");
        for (const label of [
            "Needs an outcome",
            "Awaiting payment",
            "Today",
            "Next 7 days",
            "All",
        ]) {
            await expect(
                views.getByRole("radio", {
                    name: new RegExp(`^${label}\\s*\\d+$`),
                }),
            ).toBeVisible();
        }
        await expect(
            page.getByText(/Times in \w+, your business's time zone\./),
        ).toBeVisible();

        // A view is kept in the address.
        await views.getByRole("radio", { name: /^All\s*\d+$/ }).click();
        await expect(page).toHaveURL(/view=all/);

        // More filters: Service, With and Status, then Show closes it.
        await page.getByRole("button", { name: /More filters/ }).click();
        const panel = page.getByRole("dialog", { name: "More filters" });
        await expect(panel.getByText("Service", { exact: true })).toBeVisible();
        await expect(panel.getByText("With", { exact: true })).toBeVisible();
        await panel.getByRole("button", { name: "Cancelled" }).click();
        await panel.getByRole("button", { name: /^Show \d+$/ }).click();
        await expect(panel).toBeHidden();
        await page.getByRole("button", { name: "Clear filters" }).click();

        // A search that finds nothing says so, and clears.
        await page.getByLabel("Search bookings").fill("zzzz-nobody");
        await page.getByLabel("Search bookings").press("Enter");
        await expect(
            page.getByText("No bookings match “zzzz-nobody”"),
        ).toBeVisible();
        // The toolbar's Clear search, and the empty panel's beside it.
        await page
            .getByRole("button", { name: "Clear search" })
            .first()
            .click();
        await expect(
            page.getByText("No bookings match “zzzz-nobody”"),
        ).toBeHidden();

        if (test.info().project.name.startsWith("phone")) {
            await expectNothingHiddenSideways(page);
        } else {
            await expect(page.getByText(/^When · \w+$/)).toBeVisible();
        }
        const view = await page.evaluate(() => ({
            vw: window.innerWidth,
            scroll: document.documentElement.scrollWidth,
        }));
        expect(view.scroll).toBeLessThanOrEqual(view.vw);
    });

    test("cancel from a row's menu asks first, waits with Undo, then cancels", async ({
        page,
    }) => {
        await page.clock.install();
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const owner = page.request;
        const stamp = ownStamp(test.info());
        const who = await makeContact(owner, {
            firstName: "Allbk",
            lastName: stamp,
            email: `allbk.${stamp}@example.com`,
        });
        const booked = await bookOwn(owner, who.id, 2);
        try {
            await page.goto("/bookings/all");
            await page.getByLabel("Search bookings").fill(stamp);
            await page.getByLabel("Search bookings").press("Enter");
            await page
                .getByRole("button", { name: `More for ${who.name}` })
                .filter({ visible: true })
                .click();
            await page
                .getByRole("menuitem", { name: "Cancel booking" })
                .or(
                    page
                        .getByRole("dialog", { name: who.name })
                        .getByRole("button", { name: "Cancel booking" }),
                )
                .click();
            // Nothing was paid: a plain question.
            const sheet = page.getByRole("dialog", {
                name: "Cancel Allbk's booking?",
            });
            await expect(sheet).toBeVisible();
            await expect(sheet.getByText(/Refund/)).toHaveCount(0);
            await sheet.getByRole("button", { name: "Cancel booking" }).click();
            await expect(
                page.getByText("Cancelling in 10 seconds"),
            ).toBeVisible();

            // Past the hold the booking is cancelled.
            await page.clock.runFor(11_000);
            await expect
                .poll(async () => {
                    const res = await owner.get(
                        `${urls.API_URL}/organizations/${NORTHWIND}/services/bookings/${booked.id}`,
                        { headers: { "x-organization-id": NORTHWIND } },
                    );
                    return ((await res.json()) as { status?: string }).status;
                })
                .toBe("CANCELLED");
        } finally {
            await owner.delete(
                `${urls.API_URL}/organizations/${NORTHWIND}/services/bookings/${booked.id}`,
                {
                    headers: {
                        "x-organization-id": NORTHWIND,
                        origin: urls.APP_URL,
                    },
                },
            );
            await northwind(owner).delete(`/contacts/${who.id}`);
        }
    });
});

test.describe("a booking's page (U12)", () => {
    test("the day and time as the heading, Take, Move and More, nothing sideways", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const owner = page.request;
        const stamp = ownStamp(test.info());
        const who = await makeContact(owner, {
            firstName: "Bkpage",
            lastName: stamp,
            email: `bkpage.${stamp}@example.com`,
        });
        const booked = await bookOwn(owner, who.id, 2);
        try {
            await page.goto(`/bookings/${booked.id}`);
            // The heading is when; who is in the Customer card.
            await expect(page.getByRole("heading", { level: 1 })).toContainText(
                /\d{1,2}:\d{2} (am|pm)/,
            );
            await expect(
                page.getByRole("heading", { name: "Customer" }),
            ).toBeVisible();
            await expect(
                page.getByRole("heading", { name: "What happened" }),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: "Move", exact: true }),
            ).toBeVisible();
            // More holds Cancel, last.
            await page
                .getByRole("button", { name: "More", exact: true })
                .filter({ visible: true })
                .first()
                .click();
            const cancel = page.getByRole("button", {
                name: "Cancel booking",
            });
            await expect(cancel).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(cancel).toBeHidden();
            // Take payment opens as a sheet, read only: nothing is taken.
            const take = page
                .getByRole("button", { name: /^Take ₹/ })
                .filter({ visible: true });
            if ((await take.count()) > 0 && (await take.first().isEnabled())) {
                await take.first().click();
                const sheet = page.getByRole("dialog", { name: /^Take ₹/ });
                await expect(
                    sheet.getByText("How are they paying?"),
                ).toBeVisible();
                await page.keyboard.press("Escape");
                await expect(sheet).toBeHidden();
            }
            await expectNothingHiddenSideways(page);
        } finally {
            await northwind(owner).delete(`/services/bookings/${booked.id}`);
            await northwind(owner).delete(`/contacts/${who.id}`);
        }
    });

    test("Move from the page picks a free time and moves it, with Undo on the toast", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        const owner = page.request;
        const stamp = ownStamp(test.info());
        const who = await makeContact(owner, {
            firstName: "Bkmove",
            lastName: stamp,
            email: `bkmove.${stamp}@example.com`,
        });
        const booked = await bookOwn(owner, who.id, 2);
        try {
            await page.goto(`/bookings/${booked.id}`);
            await page
                .getByRole("button", { name: "Move", exact: true })
                .click();
            const sheet = page.getByRole("dialog", {
                name: /^Move .+'s booking$/,
            });
            await expect(sheet).toBeVisible();
            const next = sheet.getByRole("button", { name: /^Next free day/ });
            if (await next.isVisible().catch(() => false)) await next.click();
            await sheet
                .getByRole("radio", { name: /^\d{1,2}:\d{2} (am|pm)/ })
                .first()
                .click();
            await sheet.getByRole("button", { name: /^Move to / }).click();
            await expect(page.getByText(/^Moved .+ to /)).toBeVisible();
            const after = await northwind(owner).get<{ startAt: string }>(
                `/services/bookings/${booked.id}`,
            );
            expect(after.startAt).not.toBe(booked.startAt);
        } finally {
            await northwind(owner).delete(`/services/bookings/${booked.id}`);
            await northwind(owner).delete(`/contacts/${who.id}`);
        }
    });
});
