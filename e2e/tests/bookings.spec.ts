// @covers accounts:/login app:/open app:/bookings app:/bookings/availability app:/services app:/services/new app:/customers api:bookings api:staff api:customer-workspace api:contacts
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    aService,
    bookOwn,
    makeContact,
    northwind,
    stamp as ownStamp,
} from "../fixtures/own-data";
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
async function diaryOfOne(
    request: APIRequestContext,
): Promise<{ id: string; name: string }> {
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
        return found;
    }
    const made = await nw.post<{ id: string }>("/staff", {
        name,
        serviceIds: [service.id],
    });
    return { id: made.id, name };
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
    test("day by person, week and agenda all draw the diary", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/bookings");
        await expect(
            page.getByRole("heading", { level: 1, name: /· today$/ }),
        ).toBeVisible();
        await expect(page.getByRole("radio", { name: /Day/ })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        await page.goto("/bookings?layout=agenda");
        await expect(
            page.getByRole("group", { name: "Pick a day" }),
        ).toBeVisible();
        await expect(
            page.getByText(/Customers can book/).first(),
        ).toBeVisible();
    });

    test("the legend follows the business: a gym that runs classes shows Class", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/bookings");
        const legend = page.getByRole("listitem");
        await expect(legend.filter({ hasText: /^One-to-one$/ })).toBeVisible();
        await expect(legend.filter({ hasText: /^Class$/ })).toBeVisible();
        await expect(legend.filter({ hasText: /^Free$/ })).toBeVisible();
        await page.goto("/bookings?layout=week");
        await expect(page.getByText(/bookings? this week/)).toBeVisible();
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
            await sheet.getByRole("link", { name: /^Open .+'s page$/ }).click();
            await expect(page).toHaveURL(new RegExp(`/customers/${who.id}`));
        } finally {
            // Its time, back for everyone else.
            await northwind(page.request).delete(
                `/services/bookings/${booked.id}`,
            );
        }
    });

    test("a booking with no phone says where to add one", async ({ page }) => {
        await signIn(page);
        const from = new Date().toISOString();
        const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
        const candidates = (await diaries(page.request, from, to))
            .filter((d) => d.person)
            .flatMap((d) => d.bookings)
            .filter(
                (b) =>
                    b.status === "CONFIRMED" &&
                    b.bookerName &&
                    b.contact &&
                    !b.bookerPhone,
            );
        let found: (typeof candidates)[number] | undefined;
        for (const b of candidates) {
            const res = await page.request.get(
                api(`/contacts/${b.contact?.id}`),
                { headers: orgHeader },
            );
            if (
                res.ok() &&
                !((await res.json()) as { phone: string | null }).phone
            ) {
                found = b;
                break;
            }
        }
        test.skip(!found, "Every upcoming booking has a phone in the seed");
        if (!found) return;
        const sheet = await openPeek(page, found);
        await expect(
            sheet.getByText("No phone yet — add it on their page"),
        ).toBeVisible();
    });

    test("cancel from the quick look, then Undo: nothing is sent", async ({
        page,
    }) => {
        // The page's own clock, so the hold can be run out rather than
        // slept through. Installed before the page loads; it keeps time.
        await page.clock.install();
        await signIn(page);
        // A future one-to-one booking with a person, within the week.
        const from = new Date().toISOString();
        const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
        const found = (await diaries(page.request, from, to))
            .filter((d) => d.person)
            .flatMap((d) => d.bookings)
            .find(
                (b) => b.status === "CONFIRMED" && !b.outcome && b.bookerName,
            );
        test.skip(!found, "No upcoming one-to-one booking in the seed");
        if (!found) return;
        const day = new Date(Date.parse(found.startAt) + IST_OFFSET_MS)
            .toISOString()
            .slice(0, 10);

        await page.goto(`/bookings?date=${day}&layout=agenda`);
        await page
            .getByRole("button", { name: new RegExp(found.bookerName ?? "") })
            .first()
            .click();
        const sheet = page.getByRole("dialog");
        await sheet
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
        await expect(
            sheet.getByText("Cancelled", { exact: true }),
        ).toBeVisible();
        await sheet.getByRole("button", { name: "Undo cancel" }).click();
        await expect(sheet.getByText("Booked", { exact: true })).toBeVisible();
        await page.keyboard.press("Escape");

        // Past the hold (use-held.ts, HOLD_MS 8s), the booking is still
        // booked and nothing was sent. Running the page's clock on fires
        // whatever timer is still held, at once.
        const sent: string[] = [];
        page.on("request", (r) => {
            if (r.method() !== "GET") sent.push(r.url());
        });
        await page.clock.runFor(9_000);
        expect(sent).toEqual([]);
        const after = (await diaries(page.request, from, to))
            .flatMap((d) => d.bookings)
            .find((b) => b.id === found.id);
        expect(after?.status).toBe("CONFIRMED");
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
            // A day per project: the desk run leaves its cancelled booking
            // drawn on its day, over the closed time the phone would open.
            const day = istDay(
                test.info().project.name.startsWith("phone") ? 3 : 2,
            );
            const person = await diaryOfOne(page.request);
            // Digits: the form capitalises each word of a new name.
            const customer = `E2E Walk-in ${Date.now()}`;

            let bookingId: string | null = null;
            let contactId: string | null = null;
            try {
                await page.goto(`/bookings?date=${day}`);
                // Closed time answers the keyboard too: it opens from the first
                // closed half hour.
                await page
                    .getByRole("button", {
                        name: new RegExp(`^Open hours for ${person.name}`),
                    })
                    .click({ position: { x: 40, y: 300 } });
                const dialog = page.getByRole("dialog");
                await expect(dialog).toContainText(`Open ${person.name} from`);
                const at = /from (\d\d:\d\d)/.exec(
                    (await dialog.getByRole("heading").first().innerText()) ||
                        "",
                )?.[1];
                const open = dialog.getByRole("button", {
                    name: "Open for bookings",
                });
                await expect(open).toBeEnabled();
                await open.click();
                await expect(
                    page.getByText(/^Opened .* only\.$/).first(),
                ).toBeVisible();

                // The new hours may join hours next to them: find the free gap
                // that holds the time just opened.
                const mins = (t: string) =>
                    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
                const gaps = page.getByRole("button", {
                    name: new RegExp(`^Book ${person.name} at`),
                });
                // The toast can land before the diary redraws, so wait for the gap.
                const holding = async () =>
                    (
                        await gaps.evaluateAll((els) =>
                            els.map((e) => e.getAttribute("aria-label") ?? ""),
                        )
                    ).findIndex((l) => {
                        const [, a = "", b = ""] =
                            /at (\d\d:\d\d), free until (\d\d:\d\d)/.exec(l) ??
                            [];
                        return (
                            at !== undefined &&
                            mins(a) <= mins(at) &&
                            mins(at) < mins(b)
                        );
                    });
                await expect.poll(holding).toBeGreaterThanOrEqual(0);
                const index = await holding();
                await gaps.nth(index).click();
                const book = page.getByRole("dialog");
                await expect(
                    book.getByText("Finding when each can start…"),
                ).toBeHidden();
                const chip = book
                    .getByRole("radiogroup", { name: "Service" })
                    .locator("button[role=radio]:not([disabled])")
                    .first();
                await expect(chip).toBeVisible();
                await chip.click();
                // The shared customer picker (E4): type, then add them new.
                await book.getByLabel("Find the customer").fill(customer);
                await book
                    .getByRole("button", {
                        name: `+ Add \u201c${customer}\u201d as a new customer`,
                    })
                    .click();
                await expect(book.getByLabel("Name")).toHaveValue(customer);
                await book
                    .getByLabel("Email")
                    .fill(
                        `${customer.replace(/\W+/g, ".").toLowerCase()}@example.test`,
                    );
                await book
                    .getByRole("button", { name: "Add customer" })
                    .click();
                await expect(
                    book.getByRole("radio", { name: `${customer} · new` }),
                ).toBeChecked();
                await book
                    .getByRole("radio", { name: "Pays at the session" })
                    .click();
                await book.getByRole("button", { name: "Book it" }).click();
                await expect(
                    page
                        .getByText(new RegExp(`^Booked ${customer} with`))
                        .first(),
                ).toBeVisible();

                const from = new Date().toISOString();
                const to = new Date(Date.now() + 4 * 86_400_000).toISOString();
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

test.describe("New booking finds the customer (E4)", () => {
    test("the last 4 digits of a phone find them, +91 or not, and nothing is saved", async ({
        page,
    }) => {
        await signIn(page);
        const people = (await (
            await page.request.get(api("/contacts"), { headers: orgHeader })
        ).json()) as {
            id: string;
            firstName: string | null;
            lastName: string | null;
            phone: string | null;
        }[];
        const withPhone = people.find(
            (c) =>
                c.firstName && (c.phone ?? "").replace(/\D/g, "").length >= 10,
        );
        test.skip(!withPhone, "Nobody on Pulse has a phone");
        if (!withPhone) return;
        const digits = (withPhone.phone ?? "").replace(/\D/g, "").slice(-10);
        const name = [withPhone.firstName, withPhone.lastName]
            .filter(Boolean)
            .join(" ");

        // The search itself: the same person by +91 and without.
        const ids = async (q: string) =>
            (
                (await (
                    await page.request.get(
                        api(`/contacts/search?q=${encodeURIComponent(q)}`),
                        { headers: orgHeader },
                    )
                ).json()) as { id: string }[]
            ).map((r) => r.id);
        expect(await ids(`+91 ${digits}`)).toContain(withPhone.id);
        expect(await ids(digits)).toContain(withPhone.id);

        // And in the dialog: typing the last 4 finds and picks them.
        await page.goto("/bookings");
        await page.getByRole("button", { name: "New booking" }).first().click();
        const book = page.getByRole("dialog");
        await book.getByLabel("Find the customer").fill(digits.slice(-4));
        const chip = book.getByRole("radio", { name, exact: true });
        await expect(chip).toBeVisible();
        await chip.click();
        await expect(chip).toBeChecked();
        // Nothing is written until "Book it". The footer's Close and the
        // corner's both read "Close"; the footer's comes first.
        await book.getByRole("button", { name: "Close" }).first().click();
        await expect(book).toBeHidden();
    });
});

test.describe("availability and services", () => {
    test("new hours refuse an overlap; the draft is discarded, not saved", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/bookings/availability");
        await expect(
            page.getByRole("heading", { level: 1, name: "Availability" }),
        ).toBeVisible();
        const monday = page.getByRole("listitem").filter({ hasText: "Monday" });
        const first = monday.getByText(/^\d\d:\d\d–\d\d:\d\d$/).first();
        test.skip(
            !(await first.count()),
            "The first person has no Monday hours",
        );
        const [from = ""] = (await first.innerText()).split("–");
        await monday.getByRole("button", { name: "+ Hours" }).click();
        await monday.getByRole("combobox", { name: "From" }).click();
        await page.getByRole("option", { name: from, exact: true }).click();
        await expect(monday.getByRole("alert")).toContainText(
            "That overlaps hours already set.",
        );
        await monday.getByRole("button", { name: "Cancel" }).click();

        await page
            .getByRole("button", { name: "Copy Monday to weekdays" })
            .click();
        const bar = page.getByRole("button", { name: "Save hours" });
        if (await bar.isVisible()) {
            await page.getByRole("button", { name: "Discard" }).click();
            await expect(bar).toBeHidden();
        }
    });

    test("a class under two places is refused, and leaving asks first (E2)", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/services");
        await page.getByRole("link", { name: "New service" }).click();
        await expect(
            page.getByRole("heading", { level: 1, name: "New service" }),
        ).toBeVisible();
        // A new service starts one-to-one, so it offers Visits (E10); a
        // class has none. The deposit (E8) waits for a price.
        await expect(page.getByLabel("Visits")).toHaveCount(1);
        await expect(
            page.getByRole("radiogroup", { name: "Deposit" }),
        ).toHaveCount(0);
        await page.getByRole("radio", { name: "Class" }).click();
        await expect(page.getByLabel("Visits")).toHaveCount(0);
        await page.getByLabel("Name").fill("E2E class");
        await page.getByRole("textbox", { name: /^Price/ }).fill("0");
        const who = page.getByRole("group", { name: "Who takes it" });
        if (await who.isVisible()) {
            await who.getByRole("checkbox").first().click();
        }
        await page.getByLabel("Places").fill("1");
        await expect(page.getByRole("alert").first()).toHaveText(
            "A class needs at least 2 places.",
        );
        await expect(
            page.getByRole("button", { name: "Add service" }),
        ).toBeDisabled();

        await page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: "Services" })
            .click();
        await expect(
            page.getByRole("alertdialog", {
                name: "Leave without creating it?",
            }),
        ).toBeVisible();
        await page.getByRole("link", { name: "Leave without saving" }).click();
        await expect(
            page.getByRole("heading", { level: 1, name: "Services" }),
        ).toBeVisible();
    });
});

test.describe("the Service Editor on Northwind (E2)", () => {
    const NORTHWIND = "seed_org";
    const nwApi = (path: string) =>
        `${urls.API_URL}/organizations/${NORTHWIND}${path}`;

    test("an Either service with a price is added, and its card says so", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto(`/open/${NORTHWIND}`);
        await page.goto("/services/new");
        const heading = page.getByRole("heading", {
            level: 1,
            name: "New service",
        });
        // isVisible() doesn't wait: give the page its first paint before
        // deciding Northwind takes no bookings.
        const opened = await heading
            .waitFor({ timeout: 10_000 })
            .then(() => true)
            .catch(() => false);
        test.skip(!opened, "Northwind doesn't take bookings");
        const name = `E2E either ${ownStamp(test.info())}`;
        await page.getByLabel("Name").fill(name);
        await page.getByRole("radio", { name: "Either — they choose" }).click();
        await page
            .getByLabel("Link to join")
            .fill("https://meet.example.com/e2e-either");
        await page.getByRole("textbox", { name: /^Price/ }).fill("500");
        const who = page.getByRole("group", { name: "Who takes it" });
        if (await who.isVisible()) {
            await who.getByRole("checkbox").first().click();
        }
        await page.getByRole("button", { name: "Add service" }).click();
        await page.waitForURL(/\/services\/(?!new)[^/]+$/);
        const id = new URL(page.url()).pathname.split("/").pop() ?? "";
        try {
            await expect(
                page.getByRole("heading", { level: 1, name }),
            ).toBeVisible();
            await expect(
                page.getByText("Taking bookings", { exact: true }),
            ).toBeVisible();

            await page.goto("/services");
            const card = page.getByRole("listitem").filter({ hasText: name });
            await expect(card).toContainText("In person or online");
            await expect(
                card.getByRole("button", { name: "Stop taking bookings" }),
            ).toBeVisible();
        } finally {
            await page.request.delete(nwApi(`/services/${id}`), {
                headers: { "x-organization-id": NORTHWIND },
            });
        }
    });
});
