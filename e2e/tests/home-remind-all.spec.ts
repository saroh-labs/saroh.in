// @covers accounts:/login app:/open app:/ api:home api:invoices
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { needsYou } from "../fixtures/home";
import {
    issueOverdue,
    makeContact,
    northwind,
    phone,
    stamp,
} from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone, openNorthwindAs } from "../fixtures/roles";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Remind all on Home's unpaid bills (DEC-171, Home plan U8, #1085, boards
 * `HARemindD`, `HARemindUndoD`, `HARemindP`): the sheet says who gets a
 * reminder for an overdue bill, who is skipped and why, and the words they
 * get; Send holds them ten seconds with Undo, and Undo sends nothing.
 *
 * @serial: Remind all is business-wide, every overdue bill Northwind has.
 * Each journey first makes an overdue bill of its own (`issueOverdue`,
 * review #36), so the bills group is there on any stack, seeded or not.
 * It never lets a reminder go: every journey ends in Cancel or Undo, and
 * the API's list of who would get one is the same after.
 *
 * At a desk the button sits on the bills group before See bills; on a
 * phone it sits in the bills sheet's foot beside See bills (U17,
 * `HPSheets`). The list is Remind many's (`POST invoices/reminders/preview`,
 * U5) for the bills Home hands it, waiting anyone heard from in 3 days.
 */

interface HomeRead {
    needGroups?: {
        kind: string;
        remind?: { invoiceIds: string[]; quietDays: number };
    }[];
}

interface Preview {
    invoices: { invoiceId: string; way: string }[];
}

const API = `${urls.API_URL}/organizations/${NORTHWIND_ORG}`;
const PREVIEW = `${API}/invoices/reminders/preview`;
const SEND = `${API}/invoices/reminders`;
const headers = { "x-organization-id": NORTHWIND_ORG, origin: urls.APP_URL };

/** The bills Home hands Remind all, and the quiet days it asks for. */
async function homeAsk(
    page: Page,
): Promise<{ invoiceIds: string[]; quietDays: number } | null> {
    const res = await page.request.get(`${API}/home`, { headers });
    expect(res.ok(), await res.text()).toBe(true);
    const home = (await res.json()) as HomeRead;
    return home.needGroups?.find((g) => g.kind === "BILLS")?.remind ?? null;
}

async function whoWouldGetOne(page: Page): Promise<string[]> {
    const ask = await homeAsk(page);
    if (!ask) return [];
    const res = await page.request.post(PREVIEW, { headers, data: ask });
    expect(res.ok(), await res.text()).toBe(true);
    const preview = (await res.json()) as Preview;
    return preview.invoices
        .filter((r) => r.way === "EMAIL")
        .map((r) => r.invoiceId)
        .sort();
}

/**
 * An overdue Northwind bill of the test's own (review #36): a contact with
 * an email and a phone, a draft for them, issued and overdue a moment
 * later. So Home has a bills group whatever the stack was seeded with.
 */
async function ownOverdueBill(page: Page): Promise<string> {
    const nw = northwind(page.request);
    const tag = `Remind all ${stamp(test.info())}`;
    const contact = await makeContact(page.request, {
        firstName: "Rohan",
        lastName: tag,
        email: `home-remind-${tag.replace(/\W+/g, "-").toLowerCase()}@example.com`,
        phone: phone(),
    });
    const made = await nw.post<{ id: string }>("/invoices", {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Shelving", quantity: 1, unitPrice: "1800" }],
    });
    await issueOverdue(page.request, made.id);
    return made.id;
}

/** Where this layout draws the bills' Remind all, or null when it doesn't. */
async function billsHost(page: Page): Promise<Locator | null> {
    if (onPhone(page)) {
        const line = page.locator('[data-phone-line="BILLS"]');
        if ((await line.count()) === 0) return null;
        const sheet = page.locator('[data-home-sheet="BILLS"]');
        await pressUntil(line, sheet);
        return sheet;
    }
    const needs = needsYou(page);
    await expect(needs).toBeVisible();
    const group = needs.locator('[data-need-group="BILLS"]');
    return (await group.count()) > 0 ? group : null;
}

test.describe("Remind all on the unpaid bills (U8)", () => {
    test(
        "lists who gets a reminder and who is skipped, and Cancel sends nothing",
        { tag: "@serial" },
        async ({ page }) => {
            test.setTimeout(90_000);
            await openNorthwindAs(page, "owner");
            await ownOverdueBill(page);
            await page.goto("/");
            const host = await billsHost(page);
            expect(host, "Home draws the bills group").not.toBeNull();
            if (!host) return;
            const before = await whoWouldGetOne(page);

            if (!onPhone(page)) {
                // Before See bills, as the board draws it.
                const labels = await host
                    .locator("a, button")
                    .allTextContents();
                expect(labels.indexOf("Remind all")).toBeLessThan(
                    labels.indexOf("See bills"),
                );
            }

            const sheet = page.getByRole("dialog", { name: "Remind all" });
            await pressUntil(
                host.getByRole("button", { name: "Remind all", exact: true }),
                sheet,
            );
            await expect(sheet).toContainText("Unpaid bills");
            await expect(
                sheet.getByRole("heading", { name: "Remind all" }),
            ).toBeVisible();
            // Wait for the read: the list, or why nobody can be reminded.
            await expect(sheet).not.toContainText("Reading who owes you");
            // Either who gets one, with the words they get, or why nobody can.
            await expect(sheet).toContainText(
                /Getting a reminder|No one to remind right now|Reminders go from your own email/,
            );
            if (before.length > 0) {
                await expect(sheet).toContainText("What they get");
                await expect(
                    sheet.locator('[data-remind-row="going"]'),
                ).toHaveCount(before.length);
                await expect(
                    sheet.getByRole("button", {
                        name: `Send ${before.length} reminder${before.length === 1 ? "" : "s"}`,
                    }),
                ).toBeVisible();
            }
            // Saroh sends no WhatsApp: the sheet never says one goes.
            await expect(sheet).not.toContainText("WhatsApp where");

            // Cancel, or Close where nobody can be reminded: the way out.
            const out = sheet.getByRole("button", {
                name: before.length > 0 ? "Cancel" : "Close",
                exact: true,
            });
            await out.last().click();
            await expect(sheet).toBeHidden();
            expect(await whoWouldGetOne(page)).toEqual(before);
        },
    );

    test(
        "Send holds the reminders ten seconds, and Undo sends none",
        { tag: "@serial" },
        async ({ page }) => {
            test.setTimeout(90_000);
            // The page's own clock, so the hold is run out, not slept (#24).
            await page.clock.install();
            await openNorthwindAs(page, "owner");
            await ownOverdueBill(page);
            await page.goto("/");
            const host = await billsHost(page);
            expect(host, "Home draws the bills group").not.toBeNull();
            if (!host) return;
            const before = await whoWouldGetOne(page);
            // Its own bill goes by email only where Northwind has its own
            // email connected on this stack (DEC-011): else nobody can be.
            test.skip(
                before.length === 0,
                "Northwind has no email of its own on this stack",
            );

            const sheet = page.getByRole("dialog", { name: "Remind all" });
            await pressUntil(
                host.getByRole("button", { name: "Remind all", exact: true }),
                sheet,
            );
            await sheet
                .getByRole("button", { name: /^Send \d+ reminders?$/ })
                .click();
            await expect(sheet).toBeHidden();

            // Waiting: the line says who they go to, and Remind all steps aside.
            await expect(host).toContainText(/Reminders going to \d+/);
            if (!onPhone(page)) await expect(host).toContainText("Sending");
            await expect(
                host.getByRole("button", { name: "Remind all", exact: true }),
            ).toHaveCount(0);
            const toast = page
                .locator("[data-sonner-toast]")
                .filter({ hasText: /go(es)? out in 10 seconds/ });
            await expect(toast).toBeVisible();

            // On a phone the toast sits behind the bills sheet: the sheet's
            // own Undo is the same one.
            await (
                onPhone(page)
                    ? host.getByRole("button", { name: "Undo", exact: true })
                    : toast.getByRole("button", { name: "Undo" })
            ).click();
            await expect(
                page
                    .locator("[data-sonner-toast]")
                    .filter({ hasText: "Nothing was sent." }),
            ).toBeVisible();
            await expect(
                host.getByRole("button", { name: "Remind all", exact: true }),
            ).toBeVisible();

            // Past where the hold would have ended, nobody was reminded.
            await page.clock.runFor(11_000);
            expect(await whoWouldGetOne(page)).toEqual(before);
        },
    );

    test(
        "a role that can't send reminders isn't offered it, and the API refuses",
        { tag: "@serial" },
        async ({ page }) => {
            // Maya, Northwind's Member ("member" is Rye's Nisha, who is
            // not on Northwind at all).
            await openNorthwindAs(page, "northwindMember");
            await page.goto("/");
            // Home itself, drawn: while it streams in, the page also holds
            // its loading frame's <main> for a moment (one when settled).
            await expect(
                page.getByRole("heading", {
                    level: 1,
                    name: /^(Good (morning|afternoon|evening)|Welcome|Hello)\b/,
                }),
            ).toBeVisible();
            await expect(page.getByRole("main")).toHaveCount(1);
            await expect(
                page.getByRole("button", { name: "Remind all", exact: true }),
            ).toHaveCount(0);

            // Home hands a member no bills to remind.
            expect(await homeAsk(page)).toBeNull();
            const read = await page.request.post(PREVIEW, {
                headers,
                data: { invoiceIds: ["inv_none"], quietDays: 3 },
            });
            expect(read.status()).toBe(403);
            const send = await page.request.post(SEND, {
                headers,
                data: { invoiceIds: ["inv_none"], quietDays: 3 },
            });
            expect(send.status()).toBe(403);
        },
    );
});
