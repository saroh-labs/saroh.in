// @covers accounts:/login app:/open app:/contacts app:/customers app:/leads app:/billing/invoices api:customer-workspace api:contacts api:leads api:invoices
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { makeContact, northwind, stamp } from "../fixtures/own-data";
import type { Role } from "../fixtures/sessions";
import { useSession } from "../fixtures/sessions";

/**
 * One person, one page (UX-050, #869): `/contacts/<id>` holds what the
 * contact page and Customer Detail held apart — leads and enquiries in
 * their own tabs beside orders, bookings and messages, with a crumb back
 * to Contacts — and `/customers/<id>` leads there, on the same tab.
 *
 * Every write is on a Northwind contact the test makes for itself, so desk
 * and phone, and every other spec, can run beside it. Rye is only read.
 */

const NORTHWIND = "seed_org";
const RYE = "seed_sc_rc_org";
const PRIYA = "seed_sc_rc_contact_priya";

async function signIn(page: Page, org: string, who: Role = "owner") {
    await useSession(page, who);
    await page.goto(`/open/${org}`);
}

const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

test.describe("the person page", () => {
    test("their leads and enquiries are tabs on their one page", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Person",
            lastName: s,
            email: `person-${s}@example.com`,
        });
        const title = `Wedding cake ${s}`;
        await northwind(page.request).post("/leads", {
            contactId: who.id,
            title,
        });

        // The old address, on a tab, lands on the one page, same tab.
        await page.goto(`/customers/${who.id}?tab=lead`);
        await expect(page).toHaveURL(
            new RegExp(`/contacts/${who.id}\\?tab=lead$`),
        );
        await expect(
            page.getByRole("heading", { level: 1, name: who.name }),
        ).toBeVisible();
        await expect(tab(page, /^Leads/)).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await expect(page.getByRole("link", { name: title })).toBeVisible();

        // The crumb goes to Contacts.
        await expect(
            page
                .getByRole("navigation", { name: "Breadcrumb" })
                .getByRole("link", { name: "Contacts" }),
        ).toBeVisible();

        // Enquiries: none yet, said in words rather than left blank.
        await tab(page, /^Enquiries/).click();
        await expect(page).toHaveURL(/tab=enq/);
        await expect(page.getByText("No enquiries yet")).toBeVisible();

        // Notes are still here, from Customer Detail.
        await expect(tab(page, /^Notes/)).toBeVisible();
    });

    test("what the contact page kept sits on Overview", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Facts",
            lastName: s,
            email: `person-${s}@example.com`,
        });
        const company = `Acme ${s}`;
        await northwind(page.request).patch(`/contacts/${who.id}`, {
            company,
        });

        await page.goto(`/contacts/${who.id}`);
        await expect(
            page.getByRole("region", { name: "Details" }),
        ).toContainText(company);
    });

    test("a link to a person from a lead lands on the one page", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Lead",
            lastName: s,
            email: `person-${s}@example.com`,
        });
        const lead = await northwind(page.request).post<{ id: string }>(
            "/leads",
            { contactId: who.id, title: `Catering ${s}` },
        );

        await page.goto(`/leads/${lead.id}`);
        await page.getByRole("link", { name: who.name }).first().click();
        await expect(page).toHaveURL(new RegExp(`/contacts/${who.id}$`));
        await expect(tab(page, /^Leads/)).toBeVisible();
    });

    test("the delete confirm says what deleting them ends", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const who = await makeContact(page.request, {
            firstName: "Ends",
            lastName: s,
            email: `person-${s}@example.com`,
        });
        await northwind(page.request).post("/leads", {
            contactId: who.id,
            title: `Birthday order ${s}`,
        });

        await page.goto(`/contacts/${who.id}`);
        await page
            .getByRole("main")
            .getByRole("button", { name: "More actions" })
            .click();
        await page
            .getByRole("menuitem", { name: "Delete their record…" })
            .click();
        const confirm = page.getByRole("alertdialog", {
            name: `Delete ${who.name}?`,
        });
        // Their one lead is counted; what they hold is named, or said in
        // general where a kind couldn't be read — never left out.
        await expect(confirm).toContainText(
            "Their notes and 1 lead go with them.",
        );
        await expect(confirm).toContainText("This cannot be undone.");
        // Nothing is deleted here.
        await confirm.getByRole("button", { name: "Keep them" }).click();
        await expect(confirm).toBeHidden();
        await expect(
            page.getByRole("heading", { level: 1, name: who.name }),
        ).toBeVisible();
    });

    test("Record payment on an unpaid invoice, from their Invoices tab", async ({
        page,
    }, testInfo) => {
        await signIn(page, NORTHWIND);
        const s = stamp(testInfo);
        const nw = northwind(page.request);
        const who = await makeContact(page.request, {
            firstName: "Pays",
            lastName: s,
            email: `person-${s}@example.com`,
        });
        const made = await nw.post<{ id: string }>("/invoices", {
            contactId: who.id,
            currency: "INR",
            lines: [
                { description: `Cake (${s})`, quantity: 1, unitPrice: "1200" },
            ],
            dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        });
        await nw.post(`/invoices/${made.id}/issue`);

        await page.goto(`/contacts/${who.id}?tab=inv`);
        await page.getByRole("button", { name: "Record payment" }).click();
        const dialog = page.getByRole("dialog", { name: "Record a payment" });
        await expect(dialog).toContainText(who.name);
        await dialog.getByRole("combobox", { name: "How it was paid" }).click();
        await page.getByRole("option", { name: "Cash" }).click();
        await dialog.getByRole("button", { name: "Mark it paid" }).click();
        await expect(dialog).toBeHidden();
        await expect
            .poll(
                async () =>
                    (await nw.get<{ status: string }>(`/invoices/${made.id}`))
                        .status,
                { timeout: 15_000 },
            )
            .toBe("PAID");
        // The tab refreshes: the row reads Paid and offers nothing more.
        await expect(
            page.getByRole("tabpanel").getByText("Paid", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Record payment" }),
        ).toHaveCount(0);
    });
});

test.describe("the person page, as a Member", () => {
    test("no leads to read: no Leads or Enquiries tab", async ({ page }) => {
        await signIn(page, RYE, "member");
        await page.goto(`/contacts/${PRIYA}`);
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
        await expect(tab(page, /^Notes/)).toBeVisible();
        for (const name of [/^Leads/, /^Enquiries/])
            await expect(tab(page, name)).toHaveCount(0);
        await expect(page.getByRole("main")).not.toContainText("₹");
        // No invoices to read, so nothing to mark paid (DEC-098).
        await page.goto(`/contacts/${PRIYA}?tab=inv`);
        await expect(
            page.getByRole("heading", { name: "Priya Raman" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Record payment" }),
        ).toHaveCount(0);
    });
});
