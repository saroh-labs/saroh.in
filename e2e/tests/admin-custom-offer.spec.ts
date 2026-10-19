// @covers admin:/businesses api:admin
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Give a custom offer and the Billing tab (admin plan U5, R5, R6). Staff is
 * Sam (`people.staff`), a Platform owner, with no support session open.
 *
 * It owns no data and changes nothing: the offer's dry run writes nothing
 * (`POST …/overrides/preview`), and every sheet is cancelled before its
 * confirm. Northwind, never a demo store. Desk and phone both run it.
 */
const PAGE = `${urls.ADMIN_URL}/businesses/${NORTHWIND_ORG}`;

test.describe("a custom offer", () => {
    test("the Billing tab shows its rows without a support session", async ({
        page,
    }) => {
        await useSession(page, "staff");
        await page.goto(`${PAGE}/billing`);

        // The tab's own rows come first and read without a session. Below
        // them the plan's detail (older plan controls) asks for support
        // access, or, when a session another test opened is still running
        // for staff, shows that detail, which repeats these rows: so take
        // the first set and don't count the support-access card.
        const rows = page.locator("[data-billing-tab]").first();
        await expect(rows).toBeVisible();
        for (const row of ["plan", "offers", "billed-to", "limits"]) {
            await expect(
                rows.locator(`[data-billing-row="${row}"]`),
            ).toBeVisible();
        }

        // Nothing wider than the screen.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBe(width);
    });

    test("the offer sheet dry-runs a plan offer and cancels without a change", async ({
        page,
    }) => {
        await useSession(page, "staff");
        await page.goto(`${PAGE}/billing`);
        // A support session open from another test repeats the rows below.
        const offers = page.locator('[data-billing-row="offers"]').first();
        await expect(offers).toBeVisible();
        const before = await offers.innerText();

        await page
            .getByRole("button", { name: "Give a custom offer…" })
            .first()
            .click();
        const sheet = page.getByRole("dialog", { name: "Give a custom offer" });
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByText("What do you want to give them?"),
        ).toBeVisible();

        const plan = sheet.getByRole("button", { name: /A plan until a date/ });
        await plan.click();
        await expect(plan).toHaveAttribute("aria-pressed", "true");
        const until = sheet.getByLabel("Until");
        test.skip(
            (await until.count()) === 0,
            "No plan to offer Northwind on this stack",
        );

        const inMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await until.fill(inMonth.toISOString().slice(0, 10));
        const seen = sheet.locator("[data-what-they-see]");
        // The API's dry run answers: what they'd see, or why not.
        await expect(seen).not.toContainText("Checking…");
        await expect(seen).not.toContainText("Fill in the offer");

        // The confirm waits for a reason.
        const confirm = sheet.locator('button[type="submit"]');
        await expect(confirm).toBeDisabled();

        await sheet.getByRole("button", { name: "Cancel" }).click();
        await expect(sheet).toHaveCount(0);
        await expect(offers).toHaveText(before);
    });

    test("Take away a module… sits under More actions, and cancels", async ({
        page,
    }) => {
        await useSession(page, "staff");
        await page.goto(`${PAGE}/overview`);

        await page.getByRole("button", { name: "More actions" }).click();
        await page
            .getByRole("menuitem", { name: "Take away a module…" })
            .click();
        const sheet = page.getByRole("dialog", { name: "Take away a module" });
        await expect(sheet).toBeVisible();
        // Nothing goes until a module, a dry run and a reason: then Escape.
        await expect(sheet.locator('button[type="submit"]')).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(sheet).toHaveCount(0);
    });
});
