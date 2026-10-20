// @covers accounts:/login app:/open app:/billing/invoices api:invoices
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { makeContact, northwind, phone, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Remind many, by channel (DEC-173, U12 #1124, INVBulkSend and
 * INVBulkSendPhone): "Remind all N" on the Overdue view opens three steps.
 *
 * 1. Pick who: every one shown is ticked.
 * 2. How each one goes: email (the business's own), WhatsApp (one tap
 *    each) and can't reach now, as Remind many's preview says. The
 *    button says what happens: "Send 1 email, then WhatsApp 1".
 * 3. Send: emails held ten seconds with Undo, WhatsApp opened for each in
 *    turn (`wa.me`, Saroh sends nothing), then the tally.
 *
 * Every write is on Northwind, on contacts and invoices the test makes,
 * found by the stamp in their names, so the sheet only ever holds the
 * test's own three. One of them was reminded today (a WhatsApp reminder
 * shared through the API), so it waits: one reminder a day either way.
 * Whether the others go by email or WhatsApp depends on whether Northwind
 * has its own email connected on this stack: the test asks the API's
 * preview and expects the sheet to say the same. `window.open` is caught
 * in the page, so no WhatsApp tab really opens.
 */

const DAY = 86_400_000;

interface Own {
    ids: string[];
    tag: string;
}

/** Three overdue Northwind invoices of the test's own; the last reminded today. */
async function ownThree(page: Page): Promise<Own> {
    const nw = northwind(page.request);
    const tag = `Remind ${stamp(test.info())}`;
    const ids: string[] = [];
    for (const [i, first] of ["Nikhil", "Vivek", "Tara"].entries()) {
        const contact = await makeContact(page.request, {
            firstName: first,
            lastName: tag,
            email: `inv-remind-${i}-${tag.replace(/\W+/g, "-").toLowerCase()}@example.com`,
            phone: phone(),
        });
        const made = await nw.post<{ id: string }>("/invoices", {
            contactId: contact.id,
            currency: "INR",
            lines: [
                {
                    description: `Shelving (${first})`,
                    quantity: 1,
                    unitPrice: String(1800 + i * 100),
                },
            ],
            dueAt: new Date(Date.now() - (13 - i) * DAY).toISOString(),
        });
        await nw.post(`/invoices/${made.id}/issue`);
        ids.push(made.id);
    }
    // Tara was reminded today, on WhatsApp: she waits until tomorrow.
    await nw.post(`/invoices/${ids[2]}/share`, {
        channel: "WHATSAPP",
        kind: "REMINDER",
    });
    return { ids, tag };
}

interface Preview {
    invoices: { invoiceId: string; way: string }[];
}

/** How the API says each would go. */
async function ways(page: Page, ids: string[]) {
    const read = await northwind(page.request).post<Preview>(
        "/invoices/reminders/preview",
        { invoiceIds: ids },
    );
    const of = (way: string) =>
        read.invoices.filter((r) => r.way === way).map((r) => r.invoiceId);
    return {
        email: of("EMAIL"),
        whatsapp: of("WHATSAPP"),
        none: [...of("WAIT"), ...of("NONE")],
    };
}

/** The button step 2 should show, from the API's ways. */
function sendLabel(w: { email: string[]; whatsapp: string[] }): string {
    const e = w.email.length;
    const n = w.whatsapp.length;
    const emails = `${e} email${e === 1 ? "" : "s"}`;
    if (e > 0 && n > 0) return `Send ${emails}, then WhatsApp ${n}`;
    if (e > 0) return `Send ${emails}`;
    if (n > 0) return `WhatsApp ${n}`;
    return "Nothing to send";
}

/** Catches `window.open`, so the test reads where WhatsApp would open. */
async function catchOpens(page: Page) {
    await page.addInitScript(() => {
        const w = window as unknown as { __opened: string[] };
        w.__opened = [];
        window.open = () => {
            const tab = {
                opener: null as unknown,
                close: () => undefined,
                location: {
                    set href(v: string) {
                        w.__opened.push(v);
                    },
                    get href() {
                        return w.__opened.at(-1) ?? "about:blank";
                    },
                },
            };
            return tab as unknown as Window;
        };
    });
}

const opened = (page: Page) =>
    page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

/** The Overdue view, searched down to the test's own three. */
async function openOverdue(page: Page, own: Own): Promise<Locator> {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    await page.goto(
        `/billing/invoices?tab=overdue&q=${encodeURIComponent(own.tag)}`,
    );
    await expect(page.locator("[data-invoice-row]")).toHaveCount(3);
    const sheet = page.getByRole("dialog", {
        name: "Remind about overdue invoices",
    });
    await pressUntil(page.getByRole("button", { name: "Remind all 3" }), sheet);
    return sheet;
}

async function toStep2(sheet: Locator) {
    await expect(sheet).toContainText("Step 1 of 3 · Pick who");
    await expect(sheet).toContainText("3 overdue shown. Ticked: 3");
    await sheet
        .getByRole("button", { name: "Next: how each one goes" })
        .click();
    await expect(sheet).toContainText("Step 2 of 3 · How each one goes");
    await expect(sheet.locator("[data-remind-ways]")).toBeVisible();
}

test.describe("Remind many by channel: Northwind, own invoices", () => {
    test("step 2 groups them as the API says, the one reminded today waits, and Not now sends nothing", async ({
        page,
    }) => {
        const own = await ownThree(page);
        const w = await ways(page, own.ids);
        expect(w.none).toContain(own.ids[2]);

        const sheet = await openOverdue(page, own);
        await toStep2(sheet);
        await expect(sheet.locator('[data-remind-row="email"]')).toHaveCount(
            w.email.length,
        );
        await expect(sheet.locator('[data-remind-row="whatsapp"]')).toHaveCount(
            w.whatsapp.length,
        );
        await expect(sheet.locator('[data-remind-row="none"]')).toHaveCount(
            w.none.length,
        );
        await expect(sheet).toContainText(
            "Reminded today. Next one tomorrow (one a day).",
        );
        await expect(
            sheet.getByRole("button", { name: sendLabel(w) }),
        ).toBeVisible();
        if (w.email.length === 0) {
            // No email of Northwind's own: no email group, and the way to connect it.
            await expect(sheet).not.toContainText("Email, sent for you");
            await expect(
                sheet.getByRole("link", { name: "Connect email" }),
            ).toHaveAttribute("href", "/settings/providers");
        }

        await sheet.getByRole("button", { name: "Not now" }).click();
        await expect(sheet).toBeHidden();
        // Nothing went: the API says the same as before.
        expect(await ways(page, own.ids)).toEqual(w);
    });

    test("Undo inside the ten seconds sends nothing and comes back to step 2", async ({
        page,
    }) => {
        const own = await ownThree(page);
        const w = await ways(page, own.ids);
        test.skip(
            w.email.length === 0,
            "Northwind has no email of its own on this stack",
        );
        const sheet = await openOverdue(page, own);
        await toStep2(sheet);
        await sheet.getByRole("button", { name: sendLabel(w) }).click();
        await expect(sheet).toContainText(/Sending \d+ emails? in 10 seconds/);
        await sheet.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(sheet).toContainText("Step 2 of 3 · How each one goes");
        // Past the ten seconds: still nobody was emailed.
        await page.waitForTimeout(11_000);
        expect((await ways(page, own.ids)).email).toEqual(w.email);
    });

    test("Send emails the email ones, opens WhatsApp for each other, and ends with the tally", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        await catchOpens(page);
        const own = await ownThree(page);
        const w = await ways(page, own.ids);
        test.skip(
            w.email.length + w.whatsapp.length === 0,
            "no one can be reached on this stack",
        );
        const sheet = await openOverdue(page, own);
        await toStep2(sheet);
        await sheet.getByRole("button", { name: sendLabel(w) }).click();

        for (let i = 0; i < w.whatsapp.length; i++) {
            await expect(sheet).toContainText(
                `WhatsApp, ${i + 1} of ${w.whatsapp.length}`,
            );
            await expect(sheet.locator("[data-preview]")).toContainText(
                "was due on",
            );
            await sheet
                .getByRole("button", { name: /^Open WhatsApp for / })
                .click();
            await expect
                .poll(async () => (await opened(page)).length)
                .toBe(i + 1);
        }
        for (const url of await opened(page)) {
            expect(url).toMatch(/^https:\/\/wa\.me\/91\d+\?text=/);
        }

        // The emails go once the ten seconds are up.
        await expect(sheet).toContainText("Reminders done", {
            timeout: 20_000,
        });
        if (w.email.length > 0) {
            await expect(sheet.locator('[data-tally="emailed"]')).toContainText(
                `${w.email.length} emailed`,
            );
        }
        if (w.whatsapp.length > 0) {
            await expect(
                sheet.locator('[data-tally="whatsapp"]'),
            ).toContainText(`${w.whatsapp.length} shared on WhatsApp`);
        }
        await expect(sheet.locator('[data-tally="waits"]')).toContainText(
            "waits until tomorrow",
        );
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(sheet).toBeHidden();

        // Each one reminded says so on its row, and how (desk: the row's slot).
        if (!onPhone(page)) {
            await expect(page.locator("[data-reminded]")).toHaveCount(
                w.email.length + w.whatsapp.length,
            );
        }
        // One a day: every one of them now waits.
        const after = await ways(page, own.ids);
        expect(after.email).toEqual([]);
        expect(after.whatsapp).toEqual([]);
    });

    test("on a phone the steps fill the screen with the button at the foot", async ({
        page,
    }) => {
        test.skip(!onPhone(page), "the phone's own layout");
        const own = await ownThree(page);
        const sheet = await openOverdue(page, own);
        const viewport = page.viewportSize();
        const box = await sheet.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(
            (viewport?.width ?? 0) - 1,
        );
        const next = sheet.getByRole("button", {
            name: "Next: how each one goes",
        });
        const nextBox = await next.boundingBox();
        expect(nextBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect((nextBox?.y ?? 0) + (nextBox?.height ?? 0)).toBeGreaterThan(
            (viewport?.height ?? 0) * 0.75,
        );
        await expectNothingHiddenSideways(page);
        await toStep2(sheet);
        await expectNothingHiddenSideways(page);
    });
});
