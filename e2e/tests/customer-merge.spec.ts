// @covers accounts:/login app:/open app:/customers api:customer-workspace api:contacts
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { phone as aPhone, stamp as ownStamp } from "../fixtures/own-data";
import type { Role } from "../fixtures/sessions";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Merging two customers (DEC-042, C10) on Customer Detail.
 *
 * A merge can't be undone, so the owner's run never touches a seeded
 * customer: it makes its own pair on Northwind — the business browser
 * writes go to — with the same phone, finds it suggested, merges it, and
 * opens the merged record's old address, which leads to the one kept. The
 * Member's run only reads (Rye, a demo store: never saved on).
 */

const NORTHWIND = "seed_org";
const RYE = "seed_sc_rc_org";
const PRIYA = "seed_sc_rc_contact_priya";

/** Carry the saved session into this test's browser, then open the business. */
async function signIn(page: Page, org: string, who: Role = "owner") {
    await useSession(page, who);
    await page.goto(`/open/${org}`);
}

/** Make a Northwind contact through the API, as the signed-in owner. */
async function makeContact(
    page: Page,
    body: { email: string; firstName: string; lastName: string; phone: string },
): Promise<string> {
    const res = await page.request.post(
        `${urls.API_URL}/organizations/${NORTHWIND}/contacts`,
        // The API refuses a write with no Origin (#50).
        {
            data: body,
            headers: {
                "x-organization-id": NORTHWIND,
                origin: urls.APP_URL,
            },
        },
    );
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as { id: string }).id;
}

test.describe("Customer Detail — merge", () => {
    test("an owner merges a suggested duplicate, and the old address leads to the one kept", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND, "owner");
        const stamp = ownStamp(test.info());
        // The same phone, two emails: the pair C2 suggests.
        const phone = aPhone();
        const kept = await makeContact(page, {
            email: `merge-a-${stamp}@example.test`,
            firstName: "Merge",
            lastName: `Kept ${stamp}`,
            phone,
        });
        const gone = await makeContact(page, {
            email: `merge-b-${stamp}@example.test`,
            firstName: "Merge",
            lastName: `Gone ${stamp}`,
            phone,
        });

        await page.goto(`/customers/${kept}`);
        const notice = page.getByRole("note").filter({
            hasText: "Looks like the same person",
        });
        await expect(notice).toContainText("has the same phone");
        await notice.getByRole("button", { name: "Merge…" }).click();

        const dialog = page.getByRole("dialog", {
            name: "Merge with a duplicate",
        });
        await expect(dialog).toContainText(
            "We found one record that looks like the same person.",
        );
        // The older record is offered to stay (default 22).
        await expect(
            dialog.getByRole("radio", { name: "Keep this record" }),
        ).toHaveAttribute("aria-checked", "true");
        await expect(dialog).toContainText("This can't be undone.");
        // Take the other record's email.
        await dialog
            .getByRole("radiogroup", { name: "Email" })
            .getByRole("radio", { name: `merge-b-${stamp}@example.test` })
            .click();
        await dialog
            .getByRole("button", { name: "Merge", exact: true })
            .click();

        await expect(page.getByText(/^Merged\. All of /)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/customers/${kept}`));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            `Merge Kept ${stamp}`,
        );
        await expect(
            page.getByText(`merge-b-${stamp}@example.test`),
        ).toBeVisible();

        // The merged record's old address lands on the one kept, same tab.
        await page.goto(`/customers/${gone}?tab=notes`);
        await expect(page).toHaveURL(
            new RegExp(`/customers/${kept}\\?tab=notes`),
        );
    });

    test("More offers a search when no duplicate is suggested", async ({
        page,
    }) => {
        await signIn(page, NORTHWIND, "owner");
        const stamp = ownStamp(test.info());
        const lone = await makeContact(page, {
            email: `merge-lone-${stamp}@example.test`,
            firstName: "Lone",
            lastName: `${stamp}`,
            phone: aPhone(),
        });
        await page.goto(`/customers/${lone}`);
        await page
            .getByRole("main")
            .getByRole("button", { name: "More actions" })
            .click();
        await page
            .getByRole("menuitem", { name: "Merge with a duplicate…" })
            .click();
        const dialog = page.getByRole("dialog", {
            name: "Merge with a duplicate",
        });
        await expect(dialog.getByLabel("Find the other record")).toBeFocused();
        await dialog.getByLabel("Find the other record").fill("zzzz-nobody");
        await expect(dialog).toContainText("No other customer matches");
        // Nothing is merged without a record picked.
        await expect(
            dialog.getByRole("button", { name: "Merge", exact: true }),
        ).toHaveCount(0);
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toBeHidden();
    });

    test("a Member sees no way to merge", async ({ page }) => {
        await signIn(page, RYE, "member");
        await page.goto(`/customers/${PRIYA}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("button", { name: "Merge…" })).toHaveCount(
            0,
        );
        // The page's own More, not the phone tab bar's.
        await expect(
            page
                .getByRole("main")
                .getByRole("button", { name: "More actions" }),
        ).toBeDisabled();
    });
});
