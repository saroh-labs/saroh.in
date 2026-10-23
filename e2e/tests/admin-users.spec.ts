// @covers admin:/users api:admin
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { people, useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Users on the operator console (admin console U9, R13): the list, its
 * search and chips, and a user's page with its tabs, at the desk and on a
 * phone.
 *
 * Staff is Sam (`people.staff`), a Platform owner, who belongs to no
 * business. Reads only: no code is sent, nothing is marked or changed, so
 * the seeded people every other spec signs in as are never touched. The
 * writes and their safeguards are `admin-people.db.spec.ts`'s.
 */
const ADMIN = urls.ADMIN_URL;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function search(page: Page, term: string) {
    await page.getByPlaceholder("Search users").fill(term);
    await expect(page).toHaveURL(
        new RegExp(`[?&]q=${escape(encodeURIComponent(term))}`),
    );
}

test.describe("Users on the operator console", () => {
    test.beforeEach(async ({ page }) => {
        await useSession(page, "staff");
    });

    test("lists users, and every row opens one", async ({ page }) => {
        await page.goto(`${ADMIN}/users`);
        await expect(
            page.getByRole("heading", { level: 1, name: "Users" }),
        ).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);

        const rows = page
            .getByRole("list", { name: "Users" })
            .getByRole("link");
        await expect(rows.first()).toBeVisible();
        const href = await rows.first().getAttribute("href");
        expect(href).toMatch(/^\/users\/[^/]+$/);
        await rows.first().click();
        await expect(page).toHaveURL(new RegExp(`${escape(href ?? "")}$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    test("the chips narrow the list, and Clear filters puts it back", async ({
        page,
    }) => {
        await page.goto(`${ADMIN}/users`);
        await search(page, people.staff.email);

        const chip = page.getByRole("button", { name: "No business yet" });
        await expect(chip).toHaveAttribute("aria-pressed", "false");
        await chip.click();
        await expect(chip).toHaveAttribute("aria-pressed", "true");
        await expect(page).toHaveURL(/filter=no-business/);
        // Sam belongs to no business.
        await expect(
            page.getByRole("list", { name: "Users" }).getByRole("link", {
                name: new RegExp(escape(people.staff.email)),
            }),
        ).toBeVisible();

        // Sam owns nothing: both chips together leave nobody.
        await page.getByRole("button", { name: "Owners" }).click();
        await expect(page).toHaveURL(/filter=no-business%2Cowners/);
        await expect(page.getByRole("list", { name: "Users" })).toHaveCount(0);
        await page.getByRole("link", { name: "Clear filters" }).click();
        await expect(page).toHaveURL(new RegExp(`${escape(ADMIN)}/users$`));
        await expect(
            page.getByRole("button", { name: "Owners" }),
        ).toHaveAttribute("aria-pressed", "false");
    });

    test("a search with no match offers Clear search", async ({ page }) => {
        await page.goto(`${ADMIN}/users`);
        await search(page, "nobody-by-this-name-u9");
        await expect(page.getByRole("list", { name: "Users" })).toHaveCount(0);
        await expect(
            page.getByRole("link", { name: "Clear search" }),
        ).toBeVisible();
    });

    test("a user's page has its tabs and Sam's sign-in help", async ({
        page,
    }) => {
        await page.goto(
            `${ADMIN}/users?q=${encodeURIComponent(people.owner.email)}`,
        );
        await page
            .getByRole("list", { name: "Users" })
            .getByRole("link", { name: new RegExp(escape(people.owner.email)) })
            .click();
        await expect(page).toHaveURL(/\/users\/[^/?]+$/);
        const userUrl = page.url();

        const tabs = page.getByRole("navigation", { name: "User" });
        for (const name of ["Overview", "Businesses", "Sign-in", "History"]) {
            await expect(tabs.getByRole("link", { name })).toBeVisible();
        }
        await expect(
            tabs.getByRole("link", { name: "Overview" }),
        ).toHaveAttribute("aria-current", "page");
        // A Platform owner holds sign-in help: the header's actions show.
        for (const name of [
            "Send a sign-in code",
            "Mark verified…",
            "Change sign-in email…",
            "Copy id",
        ]) {
            await expect(page.getByRole("button", { name })).toBeVisible();
        }

        await tabs.getByRole("link", { name: "Businesses" }).click();
        await expect(page).toHaveURL(`${userUrl}/businesses`);
        await expect(
            page.getByText("Every business they belong to"),
        ).toBeVisible();

        await tabs.getByRole("link", { name: "Sign-in" }).click();
        await expect(page).toHaveURL(`${userUrl}/sign-in`);
        await expect(page.getByText("Open sessions")).toBeVisible();

        await tabs.getByRole("link", { name: "History" }).click();
        await expect(page).toHaveURL(`${userUrl}/history`);
    });

    test("People's old address opens Users", async ({ page }) => {
        await page.goto(`${ADMIN}/people?q=asha`);
        await expect(page).toHaveURL(
            new RegExp(`${escape(ADMIN)}/users\\?q=asha$`),
        );
        await expect(
            page.getByRole("heading", { level: 1, name: "Users" }),
        ).toBeVisible();
    });
});
