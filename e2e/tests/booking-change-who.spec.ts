// @covers accounts:/login app:/open app:/bookings app:/bookings/[bookingId] api:bookings api:staff api:notifications
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, phone, stamp } from "../fixtures/own-data";
import type { OwnService } from "../fixtures/own-service";
import { ownService } from "../fixtures/own-service";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";

/**
 * Change who a booking is with, or Assign someone (#1157), end to end on
 * a phone and at a desk:
 *
 * - from a booking's page, More › Change who it's with: the list says who
 *   is free then, the change waits its ten seconds with Undo, is then
 *   written, and What happened says from whom to whom;
 * - from the calendar's quick look, a booking with nobody on it: Assign
 *   someone, and the person is written once the hold runs out.
 *
 * Every write is on Northwind, on a service and two people each test
 * makes for itself, so its times and diaries are its own; the people are
 * archived, the bookings cancelled and the service archived at the end.
 */

const NORTHWIND = "seed_org";
const IST_OFFSET_MS = 330 * 60_000;

interface BookingRead {
    id: string;
    status: string;
    staffId: string | null;
    contact: { id: string } | null;
}

/** Tomorrow in India, at `hh:mm` there, as an instant. */
function tomorrowAt(hhmm: string): string {
    const day = new Date(Date.now() + IST_OFFSET_MS + 86_400_000)
        .toISOString()
        .slice(0, 10);
    return new Date(`${day}T${hhmm}:00+05:30`).toISOString();
}

/** Someone on Northwind's diary taking `service`, all day, every day. */
async function person(
    request: APIRequestContext,
    testInfo: TestInfo,
    first: string,
    service: OwnService,
): Promise<{ id: string; name: string; first: string }> {
    const name = `${first} ${stamp(testInfo)}`;
    const made = await northwind(request).post<{ id: string }>("/staff", {
        name,
        serviceIds: [service.id],
        hours: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
    return { id: made.id, name, first };
}

/** A booking by name and phone, with `staffId` when given. */
async function book(
    request: APIRequestContext,
    service: OwnService,
    who: string,
    startAt: string,
    staffId?: string,
): Promise<string> {
    const made = await northwind(request).post<{ id: string }>(
        `/services/${service.id}/bookings`,
        {
            startAt,
            bookerName: who,
            bookerPhone: phone(),
            ...(staffId ? { staffId } : {}),
        },
    );
    return made.id;
}

/** Cancel the bookings, take their customers away, archive the rest. */
async function tidy(
    request: APIRequestContext,
    service: OwnService,
    bookingIds: string[],
    staffIds: string[],
) {
    const nw = northwind(request);
    for (const id of bookingIds) {
        const read = await nw
            .get<BookingRead>(`/services/bookings/${id}`)
            .catch(() => null);
        if (read && read.status !== "CANCELLED") {
            await nw.delete(`/services/bookings/${id}`);
        }
        if (read?.contact) await nw.delete(`/contacts/${read.contact.id}`);
    }
    for (const id of staffIds) await nw.delete(`/staff/${id}`);
    await service.remove();
}

/** More on a booking's page: "…" on a phone, a button at a desk. */
const more = (page: Page) =>
    page
        .getByRole("button", { name: "More", exact: true })
        .filter({ visible: true })
        .first();

const readStaff = async (request: APIRequestContext, id: string) =>
    (await northwind(request).get<BookingRead>(`/services/bookings/${id}`))
        .staffId;

// @serial: each test puts two people of its own on Northwind's diary
// (archived again after), which the calendar tests beside it would see,
// and which count toward the business's team.
test.describe("change who a booking is with (#1157)", () => {
    test(
        "from a booking's page: Change who it's with, held with Undo, then written",
        { tag: "@serial" },
        async ({ page }, testInfo) => {
            test.setTimeout(120_000);
            // The page's own clock, so the hold is run out, not slept.
            await page.clock.install();
            await useSession(page, "owner");
            await page.goto(`/open/${NORTHWIND}`);
            const service = await ownService(page.request, testInfo, "Who");
            const asha = await person(page.request, testInfo, "Asha", service);
            const meera = await person(
                page.request,
                testInfo,
                "Meera",
                service,
            );
            const customer = `Swap ${stamp(testInfo)}`;
            const bookingIds: string[] = [];
            try {
                const id = await book(
                    page.request,
                    service,
                    customer,
                    tomorrowAt("11:00"),
                    asha.id,
                );
                bookingIds.push(id);
                await page.goto(`/bookings/${id}`);

                const row = page.getByRole("button", {
                    name: "Change who it's with",
                });
                await pressUntil(more(page), row);
                await row.click();
                const sheet = page.getByRole("dialog", {
                    name: /^Change who .+'s booking is with$/,
                });
                await expect(sheet).toBeVisible();
                await expect(
                    sheet.getByText(`now with ${asha.name}`),
                ).toBeVisible();
                // Asha has it; Meera is free then.
                const meeraRow = sheet.getByRole("radio", {
                    name: new RegExp(`^${meera.name}`),
                });
                await expect(meeraRow).toBeEnabled();
                await expect(
                    sheet.getByRole("radio", {
                        name: new RegExp(`^${asha.name} \\(now\\)`),
                    }),
                ).toBeDisabled();
                await meeraRow.click();
                await sheet
                    .getByRole("button", {
                        name: `Give it to ${meera.first}`,
                    })
                    .click();

                // Held: the sheet closed, the toast offers Undo, nothing
                // is written yet.
                await expect(sheet).toBeHidden();
                await expect(
                    page.getByText(`Giving it to ${meera.first} in 10 seconds`),
                ).toBeVisible();
                expect(await readStaff(page.request, id)).toBe(asha.id);

                await page.clock.runFor(11_000);
                await expect
                    .poll(() => readStaff(page.request, id), {
                        timeout: 20_000,
                    })
                    .toBe(meera.id);

                // What happened says from whom to whom.
                await page.reload();
                await expect(
                    page.getByText(
                        `Changed from ${asha.name} to ${meera.name}`,
                    ),
                ).toBeVisible();
            } finally {
                await tidy(page.request, service, bookingIds, [
                    asha.id,
                    meera.id,
                ]);
            }
        },
    );

    test(
        "from the quick look: Assign someone to a booking with nobody, and Undo writes nothing",
        { tag: "@serial" },
        async ({ page }, testInfo) => {
            test.setTimeout(120_000);
            await page.clock.install();
            await useSession(page, "owner");
            await page.goto(`/open/${NORTHWIND}`);
            const service = await ownService(page.request, testInfo, "Assign");
            const customer = `Nobody ${stamp(testInfo)}`;
            const startAt = tomorrowAt("15:00");
            const bookingIds: string[] = [];
            const staffIds: string[] = [];
            try {
                // Booked before anyone takes the service: nobody is on it.
                bookingIds.push(
                    await book(page.request, service, customer, startAt),
                );
                const [id] = bookingIds;
                expect(await readStaff(page.request, id)).toBeNull();
                const asha = await person(
                    page.request,
                    testInfo,
                    "Asha",
                    service,
                );
                const meera = await person(
                    page.request,
                    testInfo,
                    "Meera",
                    service,
                );
                staffIds.push(asha.id, meera.id);

                const day = new Date(Date.parse(startAt) + IST_OFFSET_MS)
                    .toISOString()
                    .slice(0, 10);
                await page.goto(`/bookings?date=${day}&layout=agenda`);
                const block = page
                    .getByRole("button", { name: new RegExp(customer) })
                    .first();
                const look = page.getByRole("dialog");
                await pressUntil(block, look);
                await expect(look.getByText("Nobody yet")).toBeVisible();
                await look
                    .getByRole("button", { name: /^Assign someone/ })
                    .click();
                await expect(
                    look.getByRole("heading", {
                        name: /^Assign someone to .+'s booking$/,
                    }),
                ).toBeVisible();

                // Undo first: nothing is written.
                await look
                    .getByRole("radio", { name: new RegExp(`^${asha.name}`) })
                    .click();
                await look
                    .getByRole("button", { name: `Assign ${asha.first}` })
                    .click();
                await page.getByRole("button", { name: "Undo" }).click();
                await page.clock.runFor(11_000);
                expect(await readStaff(page.request, id)).toBeNull();

                // Then for real.
                await pressUntil(block, look);
                await look
                    .getByRole("button", { name: /^Assign someone/ })
                    .click();
                await look
                    .getByRole("radio", { name: new RegExp(`^${meera.name}`) })
                    .click();
                await look
                    .getByRole("button", { name: `Assign ${meera.first}` })
                    .click();
                await page.clock.runFor(11_000);
                await expect
                    .poll(() => readStaff(page.request, id), {
                        timeout: 20_000,
                    })
                    .toBe(meera.id);
            } finally {
                await tidy(page.request, service, bookingIds, staffIds);
            }
        },
    );
});
