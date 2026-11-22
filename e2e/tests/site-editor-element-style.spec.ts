// @covers app:/sites/[siteId]
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * One button styled on its own (DEC-251, DEC-252; canvas 4 `csi`, CSI-C):
 * a button on the page is selected by itself, its Style tab opens with
 * Apply to, Colour (the site's roles and Custom), Style, Corners and Size,
 * and the page outlines what Apply to would move. On a phone the same in
 * the shared sheet, Done pinned. The Site colours card sits under Pages.
 *
 * Read-only: it selects, switches Apply to and closes. Nothing is pressed
 * that changes the draft, so it shares Northwind with every other spec.
 */
async function openEditor(page: Page): Promise<boolean> {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const sites = await northwind(page.request).get<
        { id: string; subdomain: string | null }[]
    >("/sites");
    const site = sites.find((s) => s.subdomain === "northwind");
    expect(site, "Northwind has its site at northwind").toBeTruthy();
    await page.goto(`/sites/${site?.id ?? ""}`);
    await expect(page.locator("[data-layout]")).toBeVisible({
        timeout: 30_000,
    });
    return (
        (await page
            .locator("[data-site-inspector], [data-phone-editor]")
            .count()) > 0
    );
}

test("one button, styled on its own", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const phone = testInfo.project.name.startsWith("phone");
    test.skip(!(await openEditor(page)), "The Website area is off");
    const button = page.locator('[data-site-el^="button:"]').first();
    test.skip(
        (await button.count()) === 0,
        "Northwind's home page has no button to style",
    );

    if (!phone) {
        const card = page.locator("[data-site-colours]");
        await expect(card).toContainText("Site colours");
        // Change is always there: the colourways, or Brand's colours.
        await expect(
            card.getByRole("button", { name: "Change" }),
        ).toBeVisible();
    }

    await button.click();
    const panel = page.locator("[data-element-style=button]");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Apply to");
    for (const role of ["Background", "Panels", "Text", "Brand", "Lines"]) {
        await expect(panel.getByRole("radio", { name: role })).toBeVisible();
    }
    await expect(panel.getByText("Custom")).toBeVisible();
    for (const style of ["Filled", "Outline", "Soft", "Link"]) {
        await expect(panel.getByText(style, { exact: true })).toBeVisible();
    }
    await expect(panel).toContainText(/words (read clearly|are hard to read)/);

    // The page outlines the button, then every button in its section.
    const mark = await button.getAttribute("data-site-el");
    await expect(
        page.locator("style").filter({ hasText: mark ?? "" }),
    ).toHaveCount(1);
    await panel.getByRole("radio", { name: "This section" }).click();
    await expect(panel).toContainText(/\d+ buttons? in /);
    await panel.getByRole("radio", { name: "This button" }).click();

    if (phone) {
        // Content · Style, and the button stays in view above the sheet.
        await expect(page.getByRole("tab", { name: "Style" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Content" })).toBeVisible();
        const sheetTop = await page
            .locator("[data-section-sheet]")
            .evaluate((el) => el.getBoundingClientRect().top);
        await expect
            .poll(async () => {
                const box = await button.boundingBox();
                return box
                    ? box.y + box.height <= sheetTop && box.y >= 0
                    : false;
            })
            .toBe(true);
    } else {
        // A custom colour is drawn on the page as it is picked, unsaved.
        const before = await button.evaluate(
            (el) => getComputedStyle(el).backgroundColor,
        );
        await panel.locator("[data-colour-custom]").click();
        const picker = page.locator("[data-button-colour]");
        await expect(picker).toContainText("Site colours");
        await expect(picker.locator("[data-colour-square]")).toBeVisible();
        await picker.locator("input[aria-invalid]").fill("#1F5F8B");
        await expect
            .poll(() =>
                button.evaluate((el) => getComputedStyle(el).backgroundColor),
            )
            .toBe("rgb(31, 95, 139)");
        await picker.getByRole("button", { name: "Cancel" }).click();
        await expect
            .poll(() =>
                button.evaluate((el) => getComputedStyle(el).backgroundColor),
            )
            .toBe(before);
    }

    if (phone) {
        await expect(page.locator("[data-element-foot]")).toContainText("Done");
        await page
            .locator("[data-element-foot]")
            .getByRole("button", { name: "Done" })
            .click();
        await expect(panel).toBeHidden();
    } else {
        await page
            .getByRole("complementary", { name: "Inspector" })
            .getByRole("button", { name: "Close, nothing selected" })
            .click();
        await expect(panel).toBeHidden();
    }
});
