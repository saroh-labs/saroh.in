// @covers admin:/ admin:/businesses api:admin
import { expect, test } from "@playwright/test";

import { people, useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * The operator console on the seeded stack (admin plan U23): the one spec
 * every later admin screen's spec builds on.
 *
 * Staff is Sam (`people.staff`), a Platform owner by a recorded grant (the
 * seed's `staff.ts`), not by `ADMIN_ALLOWLIST`: the stack sets no
 * allowlist, so what lets Sam in is the same `PlatformAdminGuard` path real
 * staff take. The console asks the API who is staff on every screen
 * (`lib/console.ts`), so a business's owner, signed in on the same session
 * cookie, gets the bare refusal page and no menu.
 *
 * Reads only: nothing is changed, and nobody signs out (a saved session).
 */
const ADMIN = urls.ADMIN_URL;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("the operator console", () => {
    test("staff open Home, inside the console", async ({ page }, testInfo) => {
        await useSession(page, "staff");
        await page.goto(`${ADMIN}/`);

        await expect(page).toHaveURL(new RegExp(`^${escape(ADMIN)}/?$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);
        // A recorded grant, not the break-glass allowlist.
        await expect(page.getByText("Break-glass")).toHaveCount(0);
        // The console's bar says who is signed in, on a wide screen.
        if (testInfo.project.name.startsWith("desk")) {
            await expect(
                page.getByRole("banner").getByText(people.staff.email),
            ).toBeVisible();
        }
    });

    test("staff open Businesses", async ({ page }) => {
        await useSession(page, "staff");
        await page.goto(`${ADMIN}/businesses`);

        await expect(
            page.getByRole("heading", { level: 1, name: "Businesses" }),
        ).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);
    });

    test("a business's owner is refused", async ({ page }) => {
        await useSession(page, "owner");
        await page.goto(`${ADMIN}/`);

        await expect(
            page.getByText("Not authorized", { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(
                `${people.owner.email} does not have access to this area.`,
            ),
        ).toBeVisible();
        // The bare page: no console menu to show someone who isn't staff.
        await expect(
            page.getByRole("link", { name: "Businesses" }),
        ).toHaveCount(0);
    });

    test("someone signed out is sent to sign in", async ({ browser }) => {
        const context = await browser.newContext({ ignoreHTTPSErrors });
        try {
            const page = await context.newPage();
            await page.goto(`${ADMIN}/businesses`);
            await expect(page).toHaveURL(
                new RegExp(`^${escape(urls.ACCOUNTS_URL)}/login`),
            );
        } finally {
            await context.close();
        }
    });
});
