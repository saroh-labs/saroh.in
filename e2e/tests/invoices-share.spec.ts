// @covers accounts:/login app:/open app:/billing/invoices app:/billing/invoices/[invoiceId] api:invoices
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNothingHiddenSideways } from "../fixtures/hidden-sideways";
import { cardAction, menuItem } from "../fixtures/invoice-actions";
import { makeContact, northwind, phone, stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Share one invoice (DEC-173, U11 #1123, INVShareA and INVShareAPhone):
 * one sheet with WhatsApp, Email, Link and PDF.
 *
 * - WhatsApp is click-to-chat: Open WhatsApp goes to `wa.me/91…` with the
 *   API's message filled in, and Saroh sends nothing. A reminder counts
 *   towards one a day, so a second is off and says when the next can go.
 * - With no number on the invoice, it waits until one is typed.
 * - Copy link says Copied on its button, and the link out before stops
 *   working.
 * - With no email of the business's own: one message and Connect email.
 *
 * Every write is on Northwind, on invoices and contacts the test makes.
 * `window.open` is caught in the page, so no WhatsApp tab really opens.
 */

const DAY = 86_400_000;

/** A Northwind invoice for a contact of the test's own, issued, `late` days overdue. */
async function ownInvoice(
    page: Page,
    tag: string,
    {
        withPhone = true,
        late = 13,
    }: { withPhone?: boolean; late?: number } = {},
): Promise<{ id: string; number: string; first: string }> {
    const nw = northwind(page.request);
    const s = `${stamp(test.info())}-${tag}`;
    const contact = await makeContact(page.request, {
        firstName: "Vivek",
        lastName: `Share ${s}`,
        email: `inv-share-${s}@example.com`,
        ...(withPhone ? { phone: phone() } : {}),
    });
    const made = await nw.post<{ id: string }>("/invoices", {
        contactId: contact.id,
        currency: "INR",
        lines: [
            {
                description: `Shelving (${tag})`,
                quantity: 1,
                unitPrice: "8400",
            },
        ],
        dueAt: new Date(Date.now() - late * DAY).toISOString(),
    });
    const issued = await nw.post<{ number: string }>(
        `/invoices/${made.id}/issue`,
    );
    return { id: made.id, number: issued.number, first: "Vivek" };
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

async function openInvoice(page: Page, id: string) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    await page.goto(`/billing/invoices/${id}`);
}

const shareSheet = (page: Page, number: string) =>
    page.getByRole("dialog", { name: `Share ${number}` });

/** Opens the sheet from the details: WhatsApp beside Record payment, else Share. */
async function openShare(page: Page, number: string) {
    const lead = cardAction(page, "Share on WhatsApp");
    if ((await lead.count()) > 0) {
        await pressUntil(lead, shareSheet(page, number));
    } else {
        const item = await menuItem(page, "Share", "Share on WhatsApp");
        await item.click();
    }
    const sheet = shareSheet(page, number);
    await expect(sheet).toBeVisible();
    return sheet;
}

test.describe("share one invoice: Northwind, own invoices", () => {
    test("a WhatsApp reminder opens wa.me with the amount and due date; a second the same day is off", async ({
        page,
    }) => {
        await catchOpens(page);
        const inv = await ownInvoice(page, "wa");
        await openInvoice(page, inv.id);
        const sheet = await openShare(page, inv.number);

        await expect(sheet).toContainText("₹8,400");
        await expect(
            sheet.getByRole("radio", { name: "Reminder" }),
        ).toHaveAttribute("aria-checked", "true");
        const preview = sheet.locator("[data-preview]");
        await expect(preview).toContainText(
            `Your invoice ${inv.number} for ₹8,400 was due on`,
        );
        await expect(sheet).toContainText("You press send there");

        await sheet.getByRole("button", { name: "Open WhatsApp" }).click();
        await expect(sheet).toBeHidden();
        await expect
            .poll(async () => (await opened(page)).at(-1) ?? "")
            .toMatch(/^https:\/\/wa\.me\/91\d+\?text=/);
        const url = (await opened(page)).at(-1) ?? "";
        const text = new URL(url).searchParams.get("text") ?? "";
        expect(text).toContain(`Hi ${inv.first}`);
        expect(text).toContain("₹8,400 was due on");

        // One reminder a day, by WhatsApp or email.
        const again = await openShare(page, inv.number);
        await expect(
            again.getByRole("button", { name: "Open WhatsApp" }),
        ).toBeDisabled();
        await expect(again).toContainText(
            "One reminder a day. The next can go after",
        );
    });

    test("with no number, Open WhatsApp waits until one is typed", async ({
        page,
    }) => {
        await catchOpens(page);
        const inv = await ownInvoice(page, "nophone", { withPhone: false });
        await openInvoice(page, inv.id);
        const sheet = await openShare(page, inv.number);
        const open = sheet.getByRole("button", { name: "Open WhatsApp" });
        await expect(open).toBeDisabled();
        await expect(sheet).toContainText(
            `Type ${inv.first}'s number to open WhatsApp.`,
        );
        await sheet.getByLabel("To").fill("98450 11234");
        await expect(open).toBeEnabled();
        await open.click();
        await expect
            .poll(async () => (await opened(page)).at(-1) ?? "")
            .toMatch(/^https:\/\/wa\.me\/919845011234\?text=/);
    });

    test("Copy link says Copied, and the link out before stops working", async ({
        page,
        context,
    }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {
            origin: new URL(urls.APP_URL).origin,
        });
        const inv = await ownInvoice(page, "link", { late: -7 });
        const before = await northwind(page.request).post<{ url: string }>(
            `/invoices/${inv.id}/view-link`,
        );
        await openInvoice(page, inv.id);
        const sheet = await openShare(page, inv.number);
        await sheet.getByRole("tab", { name: "Link" }).click();
        await expect(sheet).toContainText("can't be shown again");
        await sheet.getByRole("button", { name: "Make a new link" }).click();
        await page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Make a new link" })
            .click();
        await expect(
            sheet.getByRole("button", { name: "Copied" }),
        ).toBeVisible();
        const link = await page.evaluate(() => navigator.clipboard.readText());
        expect(link).not.toBe(before.url);
        await expect(sheet.locator("[data-link-box]")).toContainText(link);

        // The old one is gone; the new one opens the invoice.
        const customer = await context.newPage();
        await customer.goto(
            new URL(new URL(before.url).pathname, urls.RENDERER_URL).toString(),
        );
        await expect(
            customer.getByRole("heading", { name: `Invoice ${inv.number}` }),
        ).toHaveCount(0);
        await customer.goto(
            new URL(new URL(link).pathname, urls.RENDERER_URL).toString(),
        );
        await expect(
            customer.getByRole("heading", { name: `Invoice ${inv.number}` }),
        ).toBeVisible();
        await customer.close();
    });

    test("Email says Saroh sends from the business's own email, with Connect email, when none is connected", async ({
        page,
    }) => {
        const inv = await ownInvoice(page, "email");
        const read = await northwind(page.request).get<{
            send?: { reason?: string };
        }>(`/invoices/${inv.id}`);
        test.skip(
            read.send?.reason !== "NO_EMAIL_PROVIDER",
            "Northwind has its own email connected",
        );
        await openInvoice(page, inv.id);
        const sheet = await openShare(page, inv.number);
        await sheet.getByRole("tab", { name: "Email" }).click();
        await expect(sheet).toContainText(
            "Saroh sends invoices from your own email. Until you connect it, share them on WhatsApp or as a link.",
        );
        await expect(
            sheet.getByRole("link", { name: "Connect email" }),
        ).toHaveAttribute("href", "/settings/providers");
        await expect(
            sheet.getByRole("button", { name: "Email it" }),
        ).toBeDisabled();
    });

    test("on a phone the tabs fit, nothing is hidden sideways, and the buttons are within reach", async ({
        page,
    }) => {
        test.skip(!onPhone(page), "the phone's own layout");
        const inv = await ownInvoice(page, "phone");
        await openInvoice(page, inv.id);
        const sheet = await openShare(page, inv.number);
        for (const name of ["WhatsApp", "Email", "Link", "PDF"]) {
            await expect(sheet.getByRole("tab", { name })).toBeInViewport();
        }
        await expectNothingHiddenSideways(page);
        const button = sheet.getByRole("button", { name: "Open WhatsApp" });
        const box = await button.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
});
