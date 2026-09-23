import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, urls } from "../playwright.config";

/**
 * The bookings calendar and its editors (U15, U16) on Pulse Fitness, the
 * showcase gym. Every test leaves the gym as it found it: held changes are
 * undone before the page closes (leaving would send them), and what a test
 * makes — extra hours, a booking, its contact — is removed afterwards.
 */

const ORG = "seed_sc_pulse_org";
const orgHeader = { "x-organization-id": ORG };
const api = (path: string) => `${urls.API_URL}/organizations/${ORG}${path}`;
const IST_OFFSET_MS = 330 * 60_000;

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await page.goto(`/open/${ORG}`);
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
        startAt: string;
    }[];
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

    test("cancel from the quick look, then Undo: nothing is sent", async ({
        page,
    }) => {
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

        // Past the hold, the booking is still booked.
        await page.waitForTimeout(9_000);
        const after = (await diaries(page.request, from, to))
            .flatMap((d) => d.bookings)
            .find((b) => b.id === found.id);
        expect(after?.status).toBe("CONFIRMED");
    });

    test("open extra hours on a closed stretch, then book into the new gap", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        await signIn(page);
        const day = istDay(2);
        const staff = (await (
            await page.request.get(api("/staff"), { headers: orgHeader })
        ).json()) as {
            staff: {
                id: string;
                name: string;
                status: string;
                extraHours: { id: string; date: string }[];
            }[];
        };
        const person = staff.staff.find((p) => p.status === "ACTIVE");
        test.skip(!person, "Nobody on Pulse's diary");
        if (!person) return;

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
                (await dialog.getByRole("heading").first().innerText()) || "",
            )?.[1];
            const open = dialog.getByRole("button", {
                name: "Open for bookings",
            });
            test.skip(
                await open.isDisabled(),
                "That stretch is already working time on this seed",
            );
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
            await expect(gaps.first()).toBeVisible();
            const labels = await gaps.evaluateAll((els) =>
                els.map((e) => e.getAttribute("aria-label") ?? ""),
            );
            const index = labels.findIndex((l) => {
                const [, a = "", b = ""] =
                    /at (\d\d:\d\d), free until (\d\d:\d\d)/.exec(l) ?? [];
                return (
                    at !== undefined &&
                    mins(a) <= mins(at) &&
                    mins(at) < mins(b)
                );
            });
            expect(index).toBeGreaterThanOrEqual(0);
            const gap = gaps.nth(index);
            await gap.click();
            const book = page.getByRole("dialog");
            await expect(
                book.getByText("Finding when each can start…"),
            ).toBeHidden();
            const chip = book
                .getByRole("radiogroup", { name: "Service" })
                .locator("button[role=radio]:not([disabled])")
                .first();
            test.skip(
                (await chip.count()) === 0,
                "No service this person takes starts inside the new hours",
            );
            await chip.click();
            await book.getByRole("radio", { name: "Someone new" }).click();
            await book.getByLabel("Name").fill("E2E Walk-in");
            await book.getByLabel("Email").fill("e2e.walkin@example.com");
            await book.getByRole("button", { name: "Book it" }).click();
            await expect(
                page.getByText(/^Booked E2E Walk-in with/).first(),
            ).toBeVisible();

            const made = (
                await diaries(
                    page.request,
                    new Date(Date.now()).toISOString(),
                    new Date(Date.now() + 4 * 86_400_000).toISOString(),
                )
            )
                .flatMap((d) => d.bookings)
                .find((b) => b.bookerName === "E2E Walk-in");
            expect(made).toBeTruthy();
            bookingId = made?.id ?? null;
        } finally {
            // Put the gym back: the booking, its contact, the extra hours.
            if (bookingId) {
                const res = await page.request.get(
                    api(`/services/bookings/${bookingId}`),
                    { headers: orgHeader },
                );
                contactId =
                    ((await res.json()) as { contact: { id: string } | null })
                        .contact?.id ?? null;
                await page.request.delete(
                    api(`/services/bookings/${bookingId}`),
                    {
                        headers: orgHeader,
                    },
                );
            }
            if (contactId) {
                await page.request.delete(api(`/contacts/${contactId}`), {
                    headers: orgHeader,
                });
            }
            const now = (await (
                await page.request.get(api(`/staff/${person.id}`), {
                    headers: orgHeader,
                })
            ).json()) as { extraHours: { id: string; date: string }[] };
            for (const x of now.extraHours) {
                if (
                    x.date.slice(0, 10) === day &&
                    !person.extraHours.some((y) => y.id === x.id)
                ) {
                    await page.request.delete(
                        api(`/staff/${person.id}/extra-hours/${x.id}`),
                        { headers: orgHeader },
                    );
                }
            }
        }
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

    test("a class under two places is refused with the design's words", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/services");
        await page.getByRole("button", { name: "New service" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("radio", { name: "Class" }).click();
        await dialog.getByLabel("Name").fill("E2E class");
        const who = dialog.getByRole("group", { name: "Who takes it" });
        if (await who.isVisible()) {
            await who.getByRole("button").first().click();
        }
        await dialog.getByLabel("Places").fill("1");
        await expect(dialog.getByRole("alert")).toHaveText(
            "A class needs at least 2 places.",
        );
        await expect(
            dialog.getByRole("button", { name: "Add service" }),
        ).toBeDisabled();
        await dialog.getByRole("button", { name: "Cancel" }).click();
    });
});
