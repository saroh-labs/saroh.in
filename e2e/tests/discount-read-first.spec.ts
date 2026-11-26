// @covers accounts:/login app:/open app:/commerce/discounts app:/commerce/discounts/[discountId] api:discounts
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { demoUser, urls } from "../playwright.config";

/**
 * A discount code, read first (DEC-267; finding 8): opening a code shows
 * what it gave and its facts, with no field to change by accident, and
 * Edit opens its form. The list says what each code gave off and when it
 * runs, in one column (finding 26). On Northwind, on a code of its own:
 * codes are never deleted (ending one is a date), so the stamp keeps it
 * apart from every other run's.
 */

const NORTHWIND = "seed_org";

test("a code opens read first, and Edit opens its form", async ({
    page,
}, testInfo) => {
    await useSession(page, demoUser);
    await page.goto(`/open/${NORTHWIND}`);
    const code = `RF${stamp(testInfo)
        .replace(/[^a-z0-9]/gi, "")
        .slice(-12)}`.toUpperCase();
    const made = await page.request.post(
        `${urls.API_URL}/organizations/${NORTHWIND}/discounts`,
        {
            headers: { "x-organization-id": NORTHWIND, origin: urls.APP_URL },
            data: {
                code,
                kind: "PERCENTAGE",
                percent: "10",
                appliesTo: "BUSINESS",
            },
        },
    );
    expect(made.ok()).toBe(true);
    const { id } = (await made.json()) as { id: string };

    await page.goto("/commerce/discounts");
    // A table row at the desk, a card on a phone.
    const row = page
        .locator("tr, li")
        .filter({ hasText: code })
        .filter({ visible: true })
        .first();
    // Its state is said once, with its dates.
    await expect(row).toContainText("no end date");
    // The rules are one press away, not a paragraph under the list.
    await expect(page.getByText("How codes work")).toBeVisible();

    await page.goto(`/commerce/discounts/${id}`);
    await expect(page.getByText("Not used yet")).toBeVisible();
    await expect(page.locator("main").getByRole("textbox")).toHaveCount(0);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(/edit=1/);
    await expect(
        page.locator("main").getByRole("textbox").first(),
    ).toBeVisible();
});
