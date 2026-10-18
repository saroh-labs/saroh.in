// @covers accounts:/login app:/open app:/commerce/products/settings api:catalogue
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Product settings after the 16 Oct audit, on Northwind Supply:
 *
 *  - SKUs opens with no error on a page nobody has touched, and turning
 *    "Suggest SKUs" off saves whatever the pattern holds (a clash is
 *    advice, never a block). The setting is the business's, so it is
 *    `@serial` and put back afterwards.
 *  - A value of an option is renamed where it stands, and Undo puts it
 *    back. The option is the test's own, made through the API and deleted
 *    afterwards, whatever happened.
 */

interface SkuSettings {
    pattern: string;
    suggest: boolean;
}

interface OptionView {
    id: string;
    name: string;
    values: { id: string; value: string }[];
}

test.describe("product settings", () => {
    test(
        "SKUs opens without an error, and suggestions can be turned off and saved",
        { tag: "@serial" },
        async ({ page }) => {
            test.setTimeout(90_000);
            await useSession(page);
            await page.goto(`/open/${NORTHWIND_ORG}`);
            const api = northwind(page.request);
            const was = await api.get<SkuSettings>("/catalogue/sku-pattern");

            try {
                // Start from suggestions on, as a business first is.
                await api.put("/catalogue/sku-pattern", {
                    pattern: was.pattern,
                    suggest: true,
                });
                await page.goto("/commerce/products/settings?tab=sku");
                await expect(
                    page.getByRole("heading", { name: "SKUs" }),
                ).toBeVisible();
                // Untouched: nothing said as an error, and nothing to save.
                await expect(page.locator("main [role=alert]")).toHaveCount(0);
                await expect(
                    page.getByRole("button", { name: "Save", exact: true }),
                ).toHaveCount(0);

                await page
                    .getByRole("checkbox", {
                        name: "Suggest SKUs in the product editor",
                    })
                    .click();
                const save = page.getByRole("button", {
                    name: "Save",
                    exact: true,
                });
                await expect(save).toBeEnabled();
                await save.click();
                await expect(
                    page.getByText("Saved. The editor stops suggesting SKUs."),
                ).toBeVisible();
                await expect
                    .poll(
                        async () =>
                            (
                                await api.get<SkuSettings>(
                                    "/catalogue/sku-pattern",
                                )
                            ).suggest,
                        { timeout: 15_000 },
                    )
                    .toBe(false);
            } finally {
                await api.put("/catalogue/sku-pattern", {
                    pattern: was.pattern,
                    suggest: was.suggest,
                });
            }
        },
    );

    test("a value is renamed where it stands, and Undo puts it back", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const api = northwind(page.request);
        const name = `E2E Size ${stamp(testInfo)}`.slice(0, 40);
        const made = await api.post<{ id: string }>("/catalogue/options", {
            name,
            values: ["250g", "500g"],
        });
        const valueOf = async () =>
            (await api.get<OptionView[]>("/catalogue/options"))
                .find((o) => o.id === made.id)
                ?.values.map((v) => v.value);

        try {
            await page.goto("/commerce/products/settings?tab=options");
            await page.getByRole("button", { name: `Edit ${name}` }).click();
            const sheet = page.getByRole("dialog");
            const first = sheet.getByRole("textbox", {
                name: `Value 1 of ${name}`,
            });
            await expect(first).toHaveValue("250g");
            await first.fill("250 g");
            await sheet
                .getByRole("button", { name: "Save", exact: true })
                .click();
            await expect(sheet).toBeHidden();
            await expect
                .poll(valueOf, { timeout: 15_000 })
                .toEqual(["250 g", "500g"]);

            await page
                .getByRole("button", { name: "Undo" })
                .click({ timeout: 10_000 });
            await expect
                .poll(valueOf, { timeout: 15_000 })
                .toEqual(["250g", "500g"]);
        } finally {
            await api.delete(`/catalogue/options/${made.id}`);
        }
    });
});
