// @covers app:/sites/[siteId]
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * A custom button colour on a phone (ERVPhoneColour, ERVPreviewLabel,
 * DEC-256): Custom opens a bottom sheet (the shared Drawer) with the colour
 * field, Hex, Recent and the contrast line, Use this colour pinned on top of
 * Cancel; the tapped button stays in view above it; "Preview only · not
 * saved" shows on the page while the colour is tried and goes on Cancel.
 *
 * Read-only: it picks and cancels, so it shares Northwind with every spec.
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
    return (await page.locator("[data-phone-editor]").count()) > 0;
}

test("a custom colour is picked in a bottom sheet on a phone", async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    test.skip(!testInfo.project.name.startsWith("phone"), "Phone only");
    test.skip(!(await openEditor(page)), "The Website area is off");
    const button = page.locator('[data-site-el^="button:"]').first();
    test.skip(
        (await button.count()) === 0,
        "Northwind's home page has no button to style",
    );

    await button.click();
    await page.getByRole("tab", { name: "Style" }).click();
    await page.locator("[data-colour-custom]").click();

    const sheet = page.locator("[data-colour-sheet]");
    await expect(sheet).toContainText("Button colour");
    // It replaces the Style sheet, which is kept underneath, hidden.
    const style = page.locator("[data-editor-sheet][data-colour-open]");
    await expect(style).toHaveCount(1);
    await expect(style).toBeHidden();
    await expect(sheet.locator("[data-recent]")).toBeVisible();

    // The tapped button stays in view above the sheet.
    await expect
        .poll(async () => {
            const [b, s] = await Promise.all([
                button.boundingBox(),
                sheet.boundingBox(),
            ]);
            return b && s ? b.y >= 0 && b.y + b.height <= s.y : false;
        })
        .toBe(true);

    // Use this colour is pinned, on top of Cancel.
    const actions = sheet.locator("[data-picker-actions] button");
    await expect(actions).toHaveText(["Use this colour", "Cancel"]);
    await expect(actions.first()).toBeInViewport({ ratio: 1 });

    // Trying a colour labels the page, and Cancel drops both.
    await sheet.locator("input[aria-invalid]").fill("#1F5F8B");
    await expect(page.locator("[data-preview-label]")).toHaveText(
        "Preview only · not saved",
    );
    await actions.last().click();
    await expect(sheet).toBeHidden();
    await expect(page.locator("[data-preview-label]")).toHaveCount(0);
    // Back to the Style sheet as it was: same tab.
    await expect(page.locator("[data-colour-open]")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Style" })).toHaveAttribute(
        "aria-selected",
        "true",
    );
});
