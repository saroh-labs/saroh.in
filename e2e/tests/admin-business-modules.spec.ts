// @covers admin:/businesses api:admin
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A business's Modules tab (admin plan U4, R3): one row per module with
 * its state and the fix for the gate in its way, read without a support
 * session. Staff is Sam (`people.staff`), a Platform owner, so every fix
 * is pressable.
 *
 * Reads only: a fix sheet is opened and cancelled, and nothing is changed.
 * Desk and phone both run it.
 */
const PAGE = `${urls.ADMIN_URL}/businesses/${NORTHWIND_ORG}/modules`;

/** The fixes that open a gate sheet (Give this module… opens the offer sheet). */
const FIX =
    /^(Turn on for this business…|Switch on for them…|Only they can do this…)$/;

test.describe("a business's Modules tab", () => {
    test("lists each module with its state, without a support session", async ({
        page,
    }) => {
        await useSession(page, "staff");
        await page.goto(PAGE);

        await expect(
            page.getByRole("heading", { name: "Modules", exact: true }),
        ).toBeVisible();
        const rows = page.locator("[data-module]");
        await expect(rows.first()).toBeVisible();
        // Every row says where it stands.
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
            await expect(
                rows.nth(i).getByText(/^(On|Off|Locked)$/),
            ).toBeVisible();
        }
        await expect(
            page.getByRole("button", { name: "Open support access" }),
        ).toHaveCount(0);
        // The plan-limits note, when there is one, is said once.
        expect(
            await page.getByText(/Plan limits not enforced yet/).count(),
        ).toBeLessThanOrEqual(1);

        // Nothing wider than the screen.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBe(width);
    });

    test("a fix sheet shows the gates and cancels without a change", async ({
        page,
    }) => {
        await useSession(page, "staff");
        await page.goto(PAGE);
        await expect(page.locator("[data-module]").first()).toBeVisible();

        const fix = page.locator("[data-module]").getByRole("button", {
            name: FIX,
        });
        test.skip(
            (await fix.count()) === 0,
            "Every module on Northwind is on with nothing left to do",
        );

        await fix.first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("list", { name: "Gates" })).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(1);

        await dialog
            .getByRole("button", { name: /^(Cancel|Close)$/ })
            .first()
            .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });
});
