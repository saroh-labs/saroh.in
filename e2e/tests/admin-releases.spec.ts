// @covers admin:/releases api:admin
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Releases on the operator console (admin plan U7, R11): the table, its
 * chips and search, a release's page with its tabs as addresses, and the old
 * `/flags` address landing there. Desk and phone alike.
 *
 * Reads only: no release is turned on or off here, since every other spec
 * on the stack runs against the same releases.
 */
const ADMIN = urls.ADMIN_URL;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Releases", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "staff");
    });

    test("filters the table and opens a release's page", async ({ page }) => {
        await page.goto(`${ADMIN}/releases`);
        await expect(
            page.getByRole("heading", { level: 1, name: "Releases" }),
        ).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);

        const chips = page.getByRole("group", { name: "Show" });
        const all = chips.getByRole("button", { name: /^All/ });
        const off = chips.getByRole("button", { name: /^Off/ });
        await expect(all).toHaveAttribute("aria-pressed", "true");

        // Off shows only releases no business has.
        await off.click();
        await expect(off).toHaveAttribute("aria-pressed", "true");
        await expect(all).toHaveAttribute("aria-pressed", "false");
        const rows = page.getByRole("list", { name: "Releases" });
        if ((await rows.count()) > 0) {
            await expect(
                rows.getByText(/^On for (everyone|some)$/),
            ).toHaveCount(0);
        }

        // A search that matches nothing says so and offers the way back.
        await all.click();
        const search = page.getByRole("searchbox", {
            name: "Search releases",
        });
        await search.fill("no release is called this");
        await expect(
            page.getByText("No releases match “no release is called this”"),
        ).toBeVisible();

        // The name a business sees first, the code name under it.
        await search.fill("MODULE_PAYMENTS");
        const name = page.getByRole("link", { name: "Payments", exact: true });
        await expect(name).toBeVisible();
        await expect(page.getByText("MODULE_PAYMENTS")).toBeVisible();

        await name.click();
        await expect(page).toHaveURL(
            new RegExp(`^${escape(ADMIN)}/releases/MODULE_PAYMENTS$`),
        );
        await expect(
            page.getByRole("heading", { level: 1, name: "Payments" }),
        ).toBeVisible();
        await expect(page.getByText("Default for everyone")).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Recent changes" }),
        ).toBeVisible();

        const tabs = page.getByRole("navigation", { name: "Release" });
        await tabs.getByRole("link", { name: "Who has it" }).click();
        await expect(page).toHaveURL(/\/releases\/MODULE_PAYMENTS\/who$/);
        await expect(
            page.getByRole("searchbox", { name: "Search businesses" }),
        ).toBeVisible();

        await tabs.getByRole("link", { name: "History" }).click();
        await expect(page).toHaveURL(/\/releases\/MODULE_PAYMENTS\/history$/);

        await tabs.getByRole("link", { name: "About" }).click();
        await expect(page).toHaveURL(/\/releases\/MODULE_PAYMENTS\/about$/);
        await expect(page.getByText("Can be removed when")).toBeVisible();
    });

    test("an old /flags link lands on Releases", async ({ page }) => {
        await page.goto(`${ADMIN}/flags?release=MODULE_PAYMENTS`);
        await expect(page).toHaveURL(
            new RegExp(`^${escape(ADMIN)}/releases/MODULE_PAYMENTS$`),
        );
        await page.goto(`${ADMIN}/flags`);
        await expect(page).toHaveURL(new RegExp(`^${escape(ADMIN)}/releases$`));
    });
});
