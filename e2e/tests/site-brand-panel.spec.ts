// @covers app:/sites api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { brandTab, openFromPill } from "../fixtures/phone-editor";
import { useSession } from "../fixtures/sessions";
import { setNorthwindLook } from "../fixtures/site-look";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * One Brand panel (U24b; boards WXBBrand, WXBBrandColour, WXBBrandPhone).
 *
 * On Northwind (never a demo store), desk and phone: the groups are there
 * and no slider is; spacing is a choice in Buttons and shapes; one brand
 * colour makes the page's colours, saved as the draft's `brandColour`,
 * and its Undo takes them away; a stored slider value is put back by
 * Reset to Classic.
 *
 * @serial: it changes Northwind's draft site style, and puts it back.
 */

interface SiteView {
    style: {
        brandColour?: string;
        scalars: Record<string, number>;
        palette?: unknown;
    };
    styleOptions: { scalars: { key: string; default: number }[] };
}

async function openBrand(page: Page, siteId: string, phone: boolean) {
    await useSession(page, "owner");
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
    await page.goto(`${urls.APP_URL}/sites/${siteId}`);
    if (phone) {
        await openFromPill(page, "Brand");
        return;
    }
    const brand = page.getByRole("tab", { name: "Brand" });
    await expect(brand).toBeVisible({ timeout: 30_000 });
    if ((await brand.getAttribute("aria-selected")) !== "true") {
        await brand.click();
    }
}

test.describe("one Brand panel", { tag: "@serial" }, () => {
    test("groups, no sliders, and spacing as a choice", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        try {
            await openBrand(page, look.siteId, phone);
            await expect(page.locator("input[type=range]")).toHaveCount(0);
            if (phone) {
                const sheet = await brandTab(page, "Buttons and shapes");
                await expect(
                    sheet.locator('[data-component-row="spacing"]'),
                ).toContainText("Compact");
                return;
            }
            for (const group of ["Look", "Colours", "Fonts"]) {
                await expect(
                    page.getByRole("heading", { name: group, exact: true }),
                ).toBeVisible();
            }
            await page.locator("[data-components-open]").click();
            await expect(
                page.locator('[data-component-row="spacing"]'),
            ).toContainText("Airy");
        } finally {
            await look.restore();
        }
    });

    test("makes the colours from one brand colour, and Undo takes them away", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        const style = () =>
            look.owner
                .get<SiteView>(`/sites/${look.siteId}`)
                .then((s) => s.style);
        try {
            await openBrand(page, look.siteId, phone);
            if (phone) await brandTab(page, "Colours");
            await page.locator("[data-brand-colour-open]").click();
            await page.locator("[data-brand-colour-input]").fill("#E8A0B4");
            await expect(
                page.locator("[data-brand-colour-warning]"),
            ).toContainText("too light for white words");
            await page
                .getByRole("button", { name: "Use these colours" })
                .click();
            await expect
                .poll(async () => (await style()).brandColour, {
                    timeout: 15_000,
                })
                .toBe("#E8A0B4");

            const undo = phone
                ? page.getByRole("button", { name: /^Undo Colours/ })
                : page
                      .locator("[data-look-changes]")
                      .getByRole("button", { name: /^Undo Colours/ });
            await undo.click();
            await expect
                .poll(async () => (await style()).brandColour ?? null, {
                    timeout: 15_000,
                })
                .toBeNull();
        } finally {
            await look.restore();
        }
    });

    test("Reset to Classic puts stored slider spacing back", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "Reset is the same action on a phone, behind the sheet's ⋯.",
        );
        const look = await setNorthwindLook(browser, null, testInfo);
        try {
            const site = await look.owner.get<SiteView>(
                `/sites/${look.siteId}`,
            );
            const margin = site.styleOptions.scalars.find(
                (s) => s.key === "pageMargin",
            );
            if (!margin) throw new Error("No page margin served");
            // A value only the old slider could have stored.
            await look.owner.put(`/sites/${look.siteId}/style`, {
                ...site.style,
                scalars: {
                    ...site.style.scalars,
                    pageMargin: margin.default + 10,
                },
            });

            await openBrand(page, look.siteId, false);
            await page
                .getByRole("button", { name: "Reset to Classic…" })
                .click();
            await page
                .getByRole("alertdialog")
                .getByRole("button", { name: "Reset to Classic" })
                .click();
            await expect
                .poll(
                    async () =>
                        (
                            await look.owner.get<SiteView>(
                                `/sites/${look.siteId}`,
                            )
                        ).style.scalars.pageMargin,
                    { timeout: 15_000 },
                )
                // Classic's own: the default, or the spacing the site's
                // template colourway started with.
                .not.toBe(margin.default + 10);
        } finally {
            await look.restore();
        }
    });
});
