// @covers app:/billing/invoices app:/billing/invoices/[invoiceId] api:invoices
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    chequeNumber,
    makeContact,
    northwind,
    stamp,
} from "../fixtures/own-data";
import { onPhone } from "../fixtures/roles";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Record payment (DEC-173, U10 #1122; INVRecordPlus and
 * INVRecordPlusPhone), on the invoice's page: a part payment with Undo,
 * more than is left refused with what was typed kept, a cheque recorded
 * as received and then marked as in the bank, and another that bounced.
 *
 * Every write is on a Northwind invoice the test makes for itself, with a
 * stamp no other test shares. A cheque waiting for the bank shows in the
 * business-wide cheques line, so those steps are `@serial`, and each
 * leaves no cheque waiting behind it. Desk and phone run the same steps;
 * the phone also checks the amount's number pad and the 44px targets.
 */

interface InvoiceRead {
    id: string;
    number: string | null;
    status: string;
    standing: string;
    leftToPay?: string;
    partlyPaid?: boolean;
    chequeWaiting?: boolean;
    payments?: {
        id: string;
        removed: { reason: string | null } | null;
        bankStatus: string | null;
    }[];
}

/** An issued invoice for ₹8,400 to a contact made for this test. */
async function issued(
    page: Page,
    tag: string,
): Promise<{ id: string; number: string; who: string }> {
    const nw = northwind(page.request);
    const s = `${stamp(test.info())}-${tag}`;
    const who = await makeContact(page.request, {
        firstName: "Vivek",
        lastName: `Pay ${s}`,
        email: `inv-pay-${s}@example.com`,
    });
    const made = await nw.post<{ id: string }>("/invoices", {
        contactId: who.id,
        currency: "INR",
        lines: [
            {
                description: `Trade sourdough (${tag})`,
                quantity: 1,
                unitPrice: "8400",
            },
        ],
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const done = await nw.post<{ number: string }>(
        `/invoices/${made.id}/issue`,
    );
    return { id: made.id, number: done.number, who: who.name };
}

async function open(page: Page, id: string) {
    await page.goto(`/billing/invoices/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\d{4}$/);
}

async function openSheet(page: Page) {
    await page.getByRole("button", { name: "Record payment" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Record payment" });
    await expect(sheet).toBeVisible();
    return sheet;
}

const read = (page: Page, id: string) =>
    northwind(page.request).get<InvoiceRead>(`/invoices/${id}`);

test.describe("record payment", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("a part payment reads Partly paid, and Undo puts it back", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        const inv = await issued(page, "part");
        await open(page, inv.id);
        const sheet = await openSheet(page);
        await expect(sheet).toContainText(
            `${inv.number} · ${inv.who} · ₹8,400 left of ₹8,400`,
        );

        const amount = sheet.getByLabel("Amount received");
        await expect(amount).toHaveValue("8400");
        // The amount opens the number pad on a phone.
        await expect(amount).toHaveAttribute("inputmode", "decimal");
        await amount.fill("4000");
        await expect(sheet).toContainText(
            "₹4,400 stays to pay. The invoice reads “Partly paid”.",
        );
        await sheet.getByRole("radio", { name: "Cash" }).click();

        if (onPhone(page)) {
            // A thumb's target: every choice and the button, 44px tall.
            for (const name of ["Cash", "UPI", "Today"]) {
                const box = await sheet
                    .getByRole("radio", { name, exact: true })
                    .boundingBox();
                expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
            }
            const record = await sheet
                .getByRole("button", { name: "Record ₹4,000" })
                .boundingBox();
            expect(record?.height ?? 0).toBeGreaterThanOrEqual(44);
        }

        await sheet.getByRole("button", { name: "Record ₹4,000" }).click();
        await expect(sheet).toBeHidden();
        const toast = page
            .getByText(`₹4,000 recorded on ${inv.number}. ₹4,400 left.`)
            .first();
        await expect(toast).toBeVisible();
        await expect
            .poll(async () => (await read(page, inv.id)).leftToPay)
            .toBe("4400.00");
        await expect(
            page.getByText("Partly paid", { exact: true }).first(),
        ).toBeVisible();

        // Undo within the ten seconds: owed in full again, nothing live.
        await page.getByRole("button", { name: "Undo" }).click();
        await expect
            .poll(async () => (await read(page, inv.id)).leftToPay, {
                timeout: 15_000,
            })
            .toBe("8400.00");
        const after = await read(page, inv.id);
        expect(after.partlyPaid ?? false).toBe(false);
        expect(after.payments?.every((p) => p.removed !== null)).toBe(true);
    });

    test("more than is left is refused, and what was typed stays", async ({
        page,
    }) => {
        const inv = await issued(page, "over");
        await open(page, inv.id);
        const sheet = await openSheet(page);
        const amount = sheet.getByLabel("Amount received");
        await amount.fill("9000");
        await sheet.getByRole("button", { name: "Record ₹9,000" }).click();
        await expect(sheet).toContainText(
            "₹9,000 is ₹600 more than what's left (₹8,400).",
        );
        await expect(sheet).toBeVisible();
        await expect(amount).toHaveValue("9000");
        // Nothing was written.
        expect((await read(page, inv.id)).payments ?? []).toEqual([]);

        // Its way out puts what is left in the box.
        await sheet
            .getByRole("button", { name: "Record ₹8,400" })
            .first()
            .click();
        await expect(amount).toHaveValue("8400");
        // Escape drops the draft; nothing was recorded.
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        expect((await read(page, inv.id)).status).toBe("ISSUED");
    });
});

test.describe("record payment: cheques", { tag: "@serial" }, () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
    });

    test("a cheque is paid but not in the bank, then in the bank", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        const inv = await issued(page, "cheque");
        const no = chequeNumber();
        try {
            await open(page, inv.id);
            const sheet = await openSheet(page);
            await sheet.getByRole("radio", { name: "Cheque" }).click();
            await sheet.getByLabel("Cheque no.").fill(no);
            await sheet
                .getByRole("textbox", { name: /^Bank/ })
                .fill("HDFC Bank");
            await sheet.getByRole("button", { name: "Record ₹8,400" }).click();
            await expect(sheet).toBeHidden();
            await expect(
                page
                    .getByText(
                        `Cheque for ₹8,400 recorded on ${inv.number}. Not in the bank yet.`,
                    )
                    .first(),
            ).toBeVisible();
            await expect(
                page
                    .getByText("Paid · cheque not in the bank", {
                        exact: true,
                    })
                    .first(),
            ).toBeVisible();

            // The cheques line on the list has it.
            await page.goto("/billing/invoices?view=cheques");
            await expect(page.locator("[data-cheques-line]")).toContainText(
                "Cheques not in the bank",
            );
            await expect(page.getByText(inv.who).first()).toBeVisible();

            // Mark as in the bank: plain Paid.
            await open(page, inv.id);
            await page
                .getByRole("button", { name: "Mark as in the bank" })
                .first()
                .click();
            const cleared = page.getByRole("dialog", {
                name: `Cheque ${no} is in the bank`,
            });
            await expect(cleared).toContainText("₹8,400 from");
            await cleared
                .getByRole("button", { name: "Mark as in the bank" })
                .click();
            await expect(cleared).toBeHidden();
            await expect(
                page.getByText(`Cheque ${no} is in the bank.`).first(),
            ).toBeVisible();
            await expect
                .poll(async () => (await read(page, inv.id)).chequeWaiting)
                .toBe(false);
            await expect(
                page.getByText("Paid", { exact: true }).first(),
            ).toBeVisible();
        } finally {
            await clearAnyWaiting(page, inv.id);
        }
    });

    test("a bounced cheque is owed again, and the history says so", async ({
        page,
    }) => {
        test.setTimeout(120_000);
        // Issuing refuses a due date already past, so this one is owed
        // again but not yet overdue; the overdue wording is the
        // component test's.
        const inv = await issued(page, "bounce");
        const no = chequeNumber();
        try {
            await northwind(page.request).post(`/invoices/${inv.id}/payments`, {
                method: "CHEQUE",
                chequeNumber: no,
                chequeBank: "HDFC Bank",
            });
            await open(page, inv.id);
            await page.getByRole("button", { name: "Bounced" }).first().click();
            const bounced = page.getByRole("dialog", {
                name: `Cheque ${no} bounced?`,
            });
            await expect(bounced).toContainText(`${inv.number} is owed again.`);
            await bounced.getByLabel("Why").fill("insufficient funds");
            // The one confirm: Keep the payment, then Mark as bounced.
            await expect(
                bounced.getByRole("button", { name: "Keep the payment" }),
            ).toBeVisible();
            await bounced
                .getByRole("button", { name: "Mark as bounced" })
                .click();
            await expect(bounced).toBeHidden();
            await expect(
                page.getByText(`Cheque ${no} bounced.`).first(),
            ).toBeVisible();
            await expect
                .poll(async () => (await read(page, inv.id)).leftToPay)
                .toBe("8400.00");
            expect((await read(page, inv.id)).status).toBe("ISSUED");
            await expect(
                page
                    .getByText(
                        `Cheque ${no} bounced · ₹8,400 owed again · insufficient funds`,
                    )
                    .first(),
            ).toBeVisible();
        } finally {
            await clearAnyWaiting(page, inv.id);
        }
    });
});

/** Never leave a cheque waiting for the next test: in the bank, even after a failure. */
async function clearAnyWaiting(page: Page, invoiceId: string) {
    const nw = northwind(page.request);
    const now = await nw.get<InvoiceRead>(`/invoices/${invoiceId}`);
    for (const p of now.payments ?? []) {
        if (p.removed || p.bankStatus !== "WAITING") continue;
        await page.request.post(
            `${urls.API_URL}/organizations/${NORTHWIND_ORG}/invoices/${invoiceId}/payments/${p.id}/cleared`,
            { headers: nw.headers, data: {}, failOnStatusCode: false },
        );
    }
}
