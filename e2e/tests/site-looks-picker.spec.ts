// @covers app:/sites api:sites site:/
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { setNorthwindLook } from "../fixtures/site-look";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The Look row in Website › Style (DEC-172, plan U16, #1109).
 *
 * The Northwind owner, with `SITE_LOOKS` on for Northwind alone (set and
 * put back by `fixtures/site-look.ts`), picks Quiet in the editor's Brand
 * panel: the canvas draws Quiet at once, the draft saves it, publishing
 * puts it on the live site, and choosing Classic brings the site back,
 * the row saying it isn't published yet. Each look's Preview (DEC-177)
 * draws its showcase template (DEC-182) and closes back to the look as it
 * was.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;

interface SiteView {
    style: { look?: string };
    liveLook?: string | null;
}

/** Website › Style: the rail's Brand tab on a desk, its bar on a phone. */
async function openBrand(page: Page, phone: boolean) {
    if (phone) {
        const brand = page
            .getByRole("navigation", { name: "Edit this page" })
            .getByRole("button", { name: "Brand" });
        await expect(brand).toBeVisible({ timeout: 30_000 });
        if ((await brand.getAttribute("aria-pressed")) !== "true") {
            await brand.click();
        }
        return;
    }
    const brand = page.getByRole("tab", { name: "Brand" });
    await expect(brand).toBeVisible({ timeout: 30_000 });
    if ((await brand.getAttribute("aria-selected")) !== "true") {
        await brand.click();
    }
}

/**
 * Whether the canvas draws the page in `look` (`data-site-look` on the
 * preview's root). On a phone the page is in the device frame's own
 * document, so every frame is asked.
 */
async function canvasLook(page: Page): Promise<string | null> {
    for (const frame of page.frames()) {
        const look = await frame
            .locator("[data-site-look]")
            .first()
            .getAttribute("data-site-look", { timeout: 1_000 })
            .catch(() => null);
        if (look) return look;
    }
    return null;
}

test.describe("the Look row", { tag: "@serial" }, () => {
    test("picks Quiet, previews and publishes it, then goes back to Classic", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(180_000);
        const phone = testInfo.project.name.startsWith("phone");
        // Northwind starts Classic with the flag on, whatever it was.
        const look = await setNorthwindLook(browser, null, testInfo);
        try {
            await useSession(page, "owner");
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}/sites/${look.siteId}`);
            await openBrand(page, phone);

            const row = page.getByRole("radiogroup", { name: "Look" });
            await expect(row).toBeVisible();
            const choice = (id: string) =>
                row.locator(`[data-look-choice="${id}"]`);
            // All four, Classic chosen; one of them suggested.
            for (const id of ["classic", "quiet", "folio", "live"]) {
                await expect(choice(id)).toBeVisible();
            }
            await expect(choice("classic")).toHaveAttribute(
                "aria-checked",
                "true",
            );
            await expect(row.getByText(/^Suggested/)).toHaveCount(1);
            // Every other control stays.
            await expect(
                page.getByRole("radiogroup", { name: "Typeface" }),
            ).toBeVisible();

            // Quiet: drawn on the canvas at once, saved to the draft.
            await choice("quiet").click();
            await expect(choice("quiet")).toHaveAttribute(
                "aria-checked",
                "true",
            );
            await expect.poll(() => canvasLook(page)).toBe("quiet");
            await expect
                .poll(
                    async () =>
                        (
                            await look.owner.get<SiteView>(
                                `/sites/${look.siteId}`,
                            )
                        ).style.look,
                    { timeout: 15_000 },
                )
                .toBe("quiet");

            // Publish makes the live site Quiet.
            await look.publish();
            await expect
                .poll(
                    async () => {
                        const res = await page.request.get(`${SITE}/`);
                        return (await res.text()).includes(
                            'data-site-look="quiet"',
                        );
                    },
                    { timeout: 30_000 },
                )
                .toBe(true);
            expect(
                (await look.owner.get<SiteView>(`/sites/${look.siteId}`))
                    .liveLook,
            ).toBe("quiet");

            // Classic is one choice away, and waits for Publish.
            await page.reload();
            await openBrand(page, phone);
            await choice("classic").click();
            await expect(choice("classic")).toHaveAttribute(
                "aria-checked",
                "true",
            );
            await expect(
                page.getByText(
                    "Not published yet. Your site is Quiet until you publish.",
                ),
            ).toBeVisible();
            await expect.poll(() => canvasLook(page)).toBeNull();
            await expect
                .poll(
                    async () =>
                        (
                            await look.owner.get<SiteView>(
                                `/sites/${look.siteId}`,
                            )
                        ).style.look ?? null,
                    { timeout: 15_000 },
                )
                .toBeNull();
        } finally {
            // Northwind's style and its flag override as they were, and
            // the live site republished from them.
            await look.restore();
        }
    });

    test("previews Folio and closes, the site still Classic (DEC-177)", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        try {
            await useSession(page, "owner");
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}/sites/${look.siteId}`);
            await openBrand(page, phone);

            const row = page.getByRole("radiogroup", { name: "Look" });
            await expect(row).toBeVisible();
            const open = page.getByRole("button", { name: "Preview Folio" });
            await open.click();

            // A large dialog on a desk, a full-height sheet on a phone:
            // Folio's showcase template, its name and what it suits.
            const preview = page.getByRole("dialog", { name: "Folio" });
            await expect(preview).toBeVisible();
            await expect(
                preview.getByText(/Suits classes and yoga/),
            ).toBeVisible();
            const drawn = preview.locator('[data-look-preview="folio"]');
            await expect(drawn).toBeVisible({ timeout: 15_000 });
            // The desk and phone switch keeps working.
            await preview.getByRole("radio", { name: "Phone" }).click();
            await expect(
                drawn.locator("iframe[data-device-frame]"),
            ).toBeVisible();
            await preview.getByRole("radio", { name: "Desk" }).click();
            await expect(
                drawn.locator("iframe[data-device-frame]"),
            ).toHaveCount(0);

            await preview.getByRole("button", { name: "Close" }).last().click();
            await expect(preview).toHaveCount(0);
            await expect(open).toBeFocused();

            // Nothing chosen and nothing saved: still Classic.
            await expect(
                row.locator('[data-look-choice="classic"]'),
            ).toHaveAttribute("aria-checked", "true");
            await expect.poll(() => canvasLook(page)).toBeNull();
            expect(
                (await look.owner.get<SiteView>(`/sites/${look.siteId}`)).style
                    .look ?? null,
            ).toBeNull();
        } finally {
            await look.restore();
        }
    });

    test("with the flag off, a Classic site has no Look row", async ({
        browser,
        page,
    }, testInfo) => {
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        try {
            await look.flag(false);
            await useSession(page, "owner");
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}/sites/${look.siteId}`);
            await openBrand(page, phone);
            await expect(
                page.getByRole("radiogroup", { name: "Typeface" }),
            ).toBeVisible();
            await expect(
                page.getByRole("radiogroup", { name: "Look" }),
            ).toHaveCount(0);
        } finally {
            await look.restore();
        }
    });
});
