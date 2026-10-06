// @covers accounts:/login app:/open app:/billing/invoices site:/pay/[token] site:/pay/[token]/pdf api:invoices api:payments api:capabilities
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Invoices without Payments (DEC-070, K7), on Northwind with Payments
 * switched off for the test: Invoices get a rail row of their own (in the
 * phone's More), an invoice is written, issued and marked paid, Send reads
 * "Send invoice" where there is a channel, there's no "Copy pay link", and
 * the customer's link shows the invoice with no Pay button.
 *
 * The pay link is made while Payments is still on — with it off the
 * workspace offers none, and a Send's link goes only to the customer —
 * which is also the case DEC-070 names: a link already shared opens as a
 * view link once Payments goes off.
 *
 * It owns its data (a contact and two invoices made for the test). Payments
 * is business-wide, so the test is `@serial` and puts it back in `finally`.
 */

interface ModuleView {
    key: string;
    lifecycle: string;
}

interface InvoiceRead {
    id: string;
    number: string | null;
    status: string;
    send?: { channels: string[]; payOnline?: boolean };
    payment?: { method: string } | null;
}

async function paymentsLifecycle(request: APIRequestContext) {
    const modules = await northwind(request).get<{ data: ModuleView[] }>(
        "/modules",
    );
    return modules.data.find((m) => m.key === "PAYMENTS")?.lifecycle ?? null;
}

async function setPayments(
    request: APIRequestContext,
    status: "ENABLED" | "DISABLED",
) {
    await northwind(request).put("/modules/PAYMENTS", { status });
}

/** A draft for this test's contact, one line. */
async function draft(
    request: APIRequestContext,
    contactId: string,
    what: string,
): Promise<string> {
    const made = await northwind(request).post<{ id: string }>("/invoices", {
        contactId,
        currency: "INR",
        lines: [{ description: what, quantity: 1, unitPrice: "1200" }],
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    return made.id;
}

/** The page's own action, drawn once per layout: the one on screen. */
const action = (page: Page, name: string) =>
    page
        .getByRole("button", { name, exact: true })
        .filter({ visible: true })
        .first();

test.describe("invoices without Payments (DEC-070)", { tag: "@serial" }, () => {
    test("find Invoices, issue one, mark it paid; the customer's link has no Pay", async ({
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const request = page.request;
        const nw = northwind(request);
        const was = await paymentsLifecycle(request);
        expect(was, "Northwind has a Payments module").not.toBeNull();

        const s = stamp(testInfo);
        const contact = await makeContact(request, {
            firstName: "Meera",
            lastName: `Nopay ${s}`,
            email: `k7-${s}@example.test`,
        });
        // A link shared while Payments was on (Northwind's provider).
        const shared = await draft(request, contact.id, `Logo (${s})`);
        await nw.post(`/invoices/${shared}/issue`);
        const { url } = await nw.post<{ url: string }>(
            `/invoices/${shared}/pay-link`,
        );
        const token = new URL(url).pathname.split("/").pop() ?? "";
        const sharedNumber =
            (await nw.get<InvoiceRead>(`/invoices/${shared}`)).number ?? "";

        try {
            await setPayments(request, "DISABLED");

            // The rail (or the phone's More) has Invoices of its own.
            await page.goto("/");
            // A @serial test runs as "phone-serial" on the phone.
            if (testInfo.project.name.startsWith("phone")) {
                const more = page
                    .getByRole("navigation", { name: "Main" })
                    .getByRole("button", { name: /^More/ });
                // Pressed until it opens: a press before hydration
                // does nothing.
                await expect(async () => {
                    await more.click();
                    await expect(
                        page.getByRole("dialog", {
                            name: "Everything else",
                        }),
                    ).toBeVisible({ timeout: 2_000 });
                }).toPass({ timeout: 20_000 });
                await page
                    .getByRole("dialog", { name: "Everything else" })
                    .getByRole("link", { name: /^Invoices/ })
                    .click();
            } else {
                const rail = page.getByRole("navigation", {
                    name: "Primary",
                });
                // The rail is drawn: before it is, no Payments row says
                // nothing.
                await expect(
                    rail.getByRole("link", { name: /^Invoices/ }),
                ).toBeVisible();
                await expect(
                    rail.getByRole("link", { name: /^Payments/ }),
                ).toHaveCount(0);
                await rail.getByRole("link", { name: /^Invoices/ }).click();
            }
            await expect(page).toHaveURL(/\/billing\/invoices$/);
            await expect(
                page.getByRole("heading", { level: 1, name: "Invoices" }),
            ).toBeVisible();

            // A new one, issued from its page.
            const id = await draft(request, contact.id, `Brochure (${s})`);
            const read = await nw.get<InvoiceRead>(`/invoices/${id}`);
            expect(read.send?.payOnline).toBe(false);
            await page.goto(`/billing/invoices/${id}`);
            await expect(
                page.getByRole("heading", { level: 1, name: "Draft" }),
            ).toBeVisible();
            if ((read.send?.channels.length ?? 0) > 0) {
                await expect(action(page, "Send invoice")).toBeVisible();
            }
            await expect(
                page.getByRole("button", { name: "Send with pay link" }),
            ).toHaveCount(0);
            await action(page, "Issue it").click();
            const confirm = page.getByRole("alertdialog");
            await expect(confirm).not.toContainText("pay link");
            await confirm.getByRole("button", { name: "Issue it" }).click();
            await expect
                .poll(
                    async () =>
                        (await nw.get<InvoiceRead>(`/invoices/${id}`)).status,
                    { timeout: 15_000 },
                )
                .toBe("ISSUED");

            // Unpaid: no pay link to copy, and Mark paid is there.
            const pay = action(page, "Mark paid");
            await expect(pay).toBeVisible();
            await expect(pay).toHaveCSS("cursor", "pointer");
            await expect(
                page.getByRole("button", { name: "Copy pay link" }),
            ).toHaveCount(0);
            await expect(
                page.getByText("Its link shows the invoice with no Pay"),
            ).toBeVisible();

            // Money taken in cash.
            await pay.click();
            const dialog = page.getByRole("dialog", {
                name: "Record a payment",
            });
            await dialog
                .getByRole("combobox", { name: "How it was paid" })
                .click();
            await page.getByRole("option", { name: "Cash" }).click();
            await dialog.getByRole("button", { name: "Mark it paid" }).click();
            await expect
                .poll(
                    async () =>
                        (await nw.get<InvoiceRead>(`/invoices/${id}`)).status,
                    { timeout: 15_000 },
                )
                .toBe("PAID");
            expect(
                (await nw.get<InvoiceRead>(`/invoices/${id}`)).payment?.method,
            ).toBe("CASH");
            await expect(
                page.getByText("Paid", { exact: true }).first(),
            ).toBeVisible();

            // The link shared before: the invoice, a copy, no Pay.
            await page.goto(`${urls.RENDERER_URL}/pay/${token}`);
            await expect(
                page.getByRole("heading", {
                    name: `Invoice ${sharedNumber}`,
                }),
            ).toBeVisible();
            await expect(
                page.getByText("the way they've asked you to"),
            ).toBeVisible();
            await expect(
                page.getByRole("button", { name: /^Pay / }),
            ).toHaveCount(0);
            const copy = page.getByRole("button", {
                name: "Print or save as PDF",
            });
            await expect(copy).toBeVisible();
            await expect(copy).toHaveCSS("cursor", "pointer");
            // Its PDF beside Print (DEC-083): the paper, saved as a file.
            const pdf = page.getByRole("button", {
                name: `Download PDF of invoice ${sharedNumber}`,
            });
            await expect(pdf).toBeVisible();
            await expect(pdf).toHaveCSS("cursor", "pointer");
            const [file] = await Promise.all([
                page.waitForEvent("download"),
                pdf.click(),
            ]);
            expect(file.suggestedFilename()).toBe(
                `${sharedNumber.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
            );
        } finally {
            if (was === "ENABLED") await setPayments(request, "ENABLED");
            await expect.poll(() => paymentsLifecycle(request)).toBe(was);
        }
    });
});
