// @covers accounts:/login app:/open app:/bookings api:bookings api:staff
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The Day calendar (U4, #1020; BKDCalendarDay on the desk, BKMBookingsDay
 * on a phone), read on Pulse Fitness, the showcase gym: nothing is saved.
 * Free time is a green "Free · … + Book" that opens the free-time sheet,
 * closed time says "Closed · click to open" (a phone: "tap to open"), the
 * desk has a column head per person with their count, and a phone draws
 * Everyone as one list. The page never scrolls sideways.
 */

const ORG = "seed_sc_pulse_org";
const orgHeader = { "x-organization-id": ORG, origin: urls.APP_URL };
const IST_OFFSET_MS = 330 * 60_000;

interface Person {
    id: string;
    name: string;
    status: string;
    hours: { dayOfWeek: number }[];
}

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${ORG}`);
}

/** Pulse's people on the diary, and a working day of the first with hours. */
async function aWorkingDay(page: Page) {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${ORG}/staff`,
        { headers: orgHeader },
    );
    expect(res.ok()).toBe(true);
    const { staff } = (await res.json()) as { staff: Person[] };
    const active = staff.filter((p) => p.status === "ACTIVE");
    const person = active.find((p) => p.hours.length > 0);
    // Pulse is the showcase gym and its seed gives its people weekly hours:
    // none is a broken seed, not a reason to pass.
    expect(person, "someone on Pulse has weekly hours").toBeTruthy();
    if (!person) throw new Error("Nobody on Pulse has weekly hours");
    const days = new Set(person.hours.map((h) => h.dayOfWeek));
    // A week or more ahead, so nothing is booked into all of it yet.
    for (let d = 7; d < 14; d++) {
        const day = new Date(Date.now() + IST_OFFSET_MS + d * 86_400_000)
            .toISOString()
            .slice(0, 10);
        if (days.has(new Date(`${day}T00:00:00Z`).getUTCDay())) {
            return { person, day, people: active.length };
        }
    }
    throw new Error("no working day in the next fortnight");
}

const onPhone = () => test.info().project.name.startsWith("phone");

test.describe("the Day calendar (U4)", () => {
    test("free time says Free and opens the free-time sheet; nothing is saved", async ({
        page,
    }) => {
        await signIn(page);
        const { person, day } = await aWorkingDay(page);
        await page.goto(`/bookings?date=${day}&layout=day&person=${person.id}`);
        const free = page
            .getByRole("button", {
                name: new RegExp(
                    `^Free .* with ${person.name}\\. Book or block$`,
                ),
            })
            .filter({ visible: true });
        await expect(free.first()).toBeVisible();
        await expect(free.first()).toContainText("Free ·");
        await expect(free.first()).toContainText("Book");
        // A thumb's height on a phone.
        if (onPhone()) {
            const box = await free.first().boundingBox();
            expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
        await free.first().click();
        const sheet = page.getByRole("dialog");
        await expect(sheet).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
    });

    test("closed time says what a press does, and opens these hours", async ({
        page,
    }) => {
        await signIn(page);
        const { person, day } = await aWorkingDay(page);
        await page.goto(`/bookings?date=${day}&layout=day&person=${person.id}`);
        const closed = page
            .getByRole("button", {
                name: new RegExp(
                    `^Closed .*\\. Open these hours for ${person.name}`,
                ),
            })
            .filter({ visible: true })
            .first();
        await expect(closed).toBeVisible();
        await expect(closed).toContainText(
            onPhone() ? "Closed · tap to open" : "Closed · click to open",
        );
        await closed.press("Enter");
        const sheet = page.getByRole("dialog");
        await expect(sheet).toContainText(`Open ${person.name} from`);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
    });

    test("the desk has a column head per person; a phone draws Everyone as one list", async ({
        page,
    }) => {
        await signIn(page);
        const { person, day, people } = await aWorkingDay(page);
        await page.goto(`/bookings?date=${day}&layout=day&person=all`);
        if (onPhone()) {
            await expect(
                page.locator("[data-column-head]").first(),
            ).toBeHidden();
            if (people > 1) {
                await expect(
                    page.locator("[data-everyone-column]"),
                ).toBeVisible();
            }
            const fits = await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            );
            expect(fits).toBe(true);
        } else {
            const head = page
                .locator("[data-column-head]")
                .filter({ hasText: person.name });
            await expect(head).toBeVisible();
            await expect(head).toContainText(/booked|Nothing booked|class/);
        }
    });
});
