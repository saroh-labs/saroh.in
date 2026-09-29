// @covers accounts:/login app:/open app:/commerce/customers app:/stores app:/customers api:customer-workspace api:customers api:stores
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { Role } from "../fixtures/sessions";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The Customers list (round 2 C4, Saroh Customers.dc.html): one list for the
 * whole business, keyed on the contact, read a page at a time from
 * `GET organizations/:org/customers` (C3).
 *
 * Read-only: nothing here saves, so it runs on Northwind and reads Rye & Co.
 * (a film set) without changing either. Desk and phone run the same steps.
 */

const NORTHWIND = "seed_org";
const NW_STORE = "seed_store";
const RYE = "seed_sc_rc_org";

/** Carry the saved session into this test's browser, then open the business. */
async function signIn(page: Page, org: string, who: Role = "owner") {
    await useSession(page, who);
    await page.goto(`/open/${org}`);
}

/** The business's customers as the API sees them, to pick one by. */
async function firstCustomers(page: Page, org: string, query = "") {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${org}/customers${query}`,
        { headers: { "x-organization-id": org, origin: urls.APP_URL } },
    );
    expect(res.ok()).toBe(true);
    return (await res.json()) as {
        rows: {
            contactId: string;
            name: string | null;
            email: string | null;
        }[];
        everyone: number;
        unlinkedPaying: number;
    };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("customers list", () => {
    test("search, a chip and a sort, then a row opens the customer", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND);
        const api = await firstCustomers(page, NORTHWIND);
        await page.goto("/commerce/customers");
        await expect(
            page.getByRole("heading", { name: "Customers", level: 1 }),
        ).toBeVisible();
        test.skip(api.rows.length === 0, "Northwind has no customer rows");

        const someone = api.rows[0];
        const name = someone.name ?? someone.email ?? "";
        await page
            .getByRole("searchbox", { name: /Search by name/ })
            .fill(name);
        await expect(page).toHaveURL(/[?&]q=/);
        await expect(
            page.getByRole("link", { name: new RegExp(escape(name)) }).first(),
        ).toBeVisible();

        await page.getByRole("button", { name: /^Returning/ }).click();
        await expect(page).toHaveURL(/chip=returning/);
        await expect(
            page.getByRole("button", { name: /^Returning/ }),
        ).toHaveAttribute("aria-pressed", "true");

        await page.getByRole("combobox", { name: "Sort" }).click();
        await page.getByRole("option", { name: "Spent, highest" }).click();
        await expect(page).toHaveURL(/sort=spent/);

        // Clear back to everyone, then open the person.
        await page.goto("/commerce/customers");
        await page
            .getByRole("link", { name: new RegExp(escape(name)) })
            .first()
            .click();
        await expect(page).toHaveURL(/\/customers\/[^/?]+$/);
    });

    test("a storefront's old address opens the list filtered to it", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND);
        await page.goto(`/stores/${NW_STORE}/customers`);
        await expect(page).toHaveURL(
            new RegExp(`/commerce/customers\\?store=${NW_STORE}`),
        );
        await expect(
            page.getByRole("heading", { name: "Customers", level: 1 }),
        ).toBeVisible();
    });

    test("a search that finds nothing says so and clears", async ({ page }) => {
        await signIn(page, NORTHWIND);
        await page.goto("/commerce/customers?q=zzzz-nobody-zzzz");
        await expect(
            page.getByText("No customers match “zzzz-nobody-zzzz”"),
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Clear search and filters" })
            .click();
        await expect(page).toHaveURL(/\/commerce\/customers$/);
    });

    test("unlinked paying customers are named, and Review lists them", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND);
        const api = await firstCustomers(page, NORTHWIND);
        test.skip(api.unlinkedPaying === 0, "Every paying customer is linked");
        await page.goto("/commerce/customers");
        const notice = page.getByText(
            /paying customers? (aren't|isn't) linked to a contact yet/,
        );
        await expect(notice).toBeVisible();
        await page.getByRole("button", { name: "Review" }).click();
        const sheet = page.getByRole("dialog", {
            name: "Paying customers to link",
        });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole("listitem").first()).toBeVisible();
    });

    test("a Member without invoices sees no Spent", async ({ page }) => {
        await signIn(page, RYE, "member");
        await page.goto("/commerce/customers");
        await expect(
            page.getByRole("heading", { name: "Customers", level: 1 }),
        ).toBeVisible();
        await expect(page.getByText("Spent", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("main")).not.toContainText("₹");
    });

    test("the list never scrolls the page sideways", async ({ page }) => {
        await signIn(page, NORTHWIND);
        await page.goto("/commerce/customers");
        await expect(
            page.getByRole("heading", { name: "Customers", level: 1 }),
        ).toBeVisible();
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(overflow).toBe(false);
    });
});
