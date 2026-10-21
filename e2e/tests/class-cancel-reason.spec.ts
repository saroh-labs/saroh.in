// @covers accounts:/login app:/open app:/bookings app:/bookings/[bookingId] api:bookings api:site-accounts
import type { APIRequestContext, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, phone, stamp } from "../fixtures/own-data";
import type { OwnService } from "../fixtures/own-service";
import { bookOnOwn } from "../fixtures/own-service";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";

/**
 * Cancelling a whole class asks why (DEC-178, #1172), on a phone and at a
 * desk: the calendar's quick look, More › Cancel the class opens a dialog
 * whose one field is "Why is it cancelled? Your customers see this.";
 * pressing Cancel the class with nothing typed says to give a reason; with
 * one, the class is held ten seconds with Undo and then every place is
 * cancelled; each booking's What happened says "Class cancelled" and the
 * reason, as typed.
 *
 * Owns its data on Northwind: a class of three made for this test, two
 * places booked in it by hand, and the class archived at the end.
 */

const NORTHWIND = "seed_org";
const IST_OFFSET_MS = 330 * 60_000;

interface BookingRead {
    id: string;
    status: string;
    contact: { id: string } | null;
}

/** Tomorrow in India, at `hh:mm` there, as an instant. */
function tomorrowAt(hhmm: string): string {
    const day = new Date(Date.now() + IST_OFFSET_MS + 86_400_000)
        .toISOString()
        .slice(0, 10);
    return new Date(`${day}T${hhmm}:00+05:30`).toISOString();
}

/** A class of three, open all day every day, booked by the team only. */
async function ownClass(
    request: APIRequestContext,
    testInfo: TestInfo,
): Promise<OwnService> {
    const nw = northwind(request);
    const name = `E2E Reason class ${stamp(testInfo)}`;
    const made = await nw.post<{ id: string }>("/services", {
        name,
        durationMinutes: 60,
        capacity: 3,
        priceCents: 0,
        currency: "INR",
        timezone: "Asia/Kolkata",
        locationType: "ONLINE",
        meetingUrl: "https://meet.example.com/e2e-reason",
        showOnBookingPage: false,
        bookableByTeam: true,
    });
    await nw.put(`/services/${made.id}/rules`, {
        rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
    return {
        id: made.id,
        name,
        priceCents: 0,
        durationMinutes: 60,
        remove: async () => {
            await nw.delete(`/services/${made.id}`);
        },
    };
}

const readStatus = async (request: APIRequestContext, id: string) =>
    (await northwind(request).get<BookingRead>(`/services/bookings/${id}`))
        .status;

test.describe("cancel a class with a reason (#1172)", () => {
    test("the quick look asks why, holds it with Undo, and the history keeps the reason", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        // The page's own clock, so the hold is run out, not slept.
        await page.clock.install();
        await useSession(page, "owner");
        await page.goto(`/open/${NORTHWIND}`);
        const service = await ownClass(page.request, testInfo);
        const startAt = tomorrowAt("18:00");
        const bookingIds: string[] = [];
        try {
            for (const who of ["Ira", "Dev"]) {
                const booked = await bookOnOwn(
                    page.request,
                    service,
                    { name: `${who} ${stamp(testInfo)}`, phone: phone() },
                    { startAt },
                );
                bookingIds.push(booked.id);
            }
            const day = new Date(Date.parse(startAt) + IST_OFFSET_MS)
                .toISOString()
                .slice(0, 10);
            await page.goto(`/bookings?date=${day}&layout=agenda`);
            const block = page
                .getByRole("button", { name: new RegExp(service.name) })
                .first();
            const look = page.locator("[data-quick-look]");
            await pressUntil(block, look);
            await expect(look.getByText("Who's booked")).toBeVisible();

            const row = page.getByRole("button", { name: "Cancel the class" });
            await pressUntil(
                look.getByRole("button", { name: "More", exact: true }),
                row,
            );
            await row.click();
            const ask = page.getByRole("dialog", { name: "Cancel the class" });
            await expect(ask).toBeVisible();
            const reason = ask.getByLabel(
                "Why is it cancelled? Your customers see this.",
            );
            await expect(reason).toBeVisible();

            // Nothing typed: it says what's missing, and nothing goes.
            await ask.getByRole("button", { name: "Cancel the class" }).click();
            await expect(
                ask.getByText("Say why the class is cancelled"),
            ).toBeVisible();

            const typed = `Our teacher is unwell <b>sorry</b> ${stamp(testInfo)}`;
            await reason.fill(typed);
            await ask.getByRole("button", { name: "Cancel the class" }).click();
            await expect(ask).toBeHidden();
            await expect(
                page.getByRole("button", { name: "Undo" }).first(),
            ).toBeVisible();
            // Held: nothing written yet.
            expect(await readStatus(page.request, bookingIds[0])).toBe(
                "CONFIRMED",
            );

            await page.clock.runFor(11_000);
            for (const id of bookingIds) {
                await expect
                    .poll(() => readStatus(page.request, id), {
                        timeout: 20_000,
                    })
                    .toBe("CANCELLED");
            }

            // What happened keeps the reason, as typed.
            await page.goto(`/bookings/${bookingIds[0]}`);
            await expect(page.getByText("Class cancelled")).toBeVisible();
            await expect(page.getByText(`Reason: ${typed}`)).toBeVisible();
        } finally {
            const nw = northwind(page.request);
            for (const id of bookingIds) {
                const read = await nw
                    .get<BookingRead>(`/services/bookings/${id}`)
                    .catch(() => null);
                if (read && read.status !== "CANCELLED") {
                    await nw.delete(`/services/bookings/${id}`);
                }
                if (read?.contact) {
                    await nw.delete(`/contacts/${read.contact.id}`);
                }
            }
            await service.remove();
        }
    });
});
