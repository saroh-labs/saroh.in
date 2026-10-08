// @covers accounts:/login app:/open app:/contacts app:/customers app:/leads api:customer-workspace api:contacts api:leads
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
    });
});
