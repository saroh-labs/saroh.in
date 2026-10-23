// @covers app:/sites api:sites api:billing
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import {
    grantNorthwindThemes,
    overrideNorthwindFlag,
    setNorthwindLook,
} from "../fixtures/site-look";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Free and paid looks, typefaces and colourways (DEC-177, #1163).
 *
 * Classic is the only free look (owner, 21 Oct): Quiet, Folio and Live
 * need "Themes, fonts and templates" (`themes`) on the plan. With plan
 * limits enforced for Northwind alone (`PLAN_ENFORCEMENT`, as admin →
 * Flags sets it) and `SITE_LOOKS` on, both put back after:
 *
 * - on a plan without `themes`, Quiet says "Paid plans" and choosing it is
 *   refused in the panel: Classic stays chosen, one line says why, nothing
 *   is saved, and the API refuses the same save;
 * - a typeface the catalogue doesn't make free is refused the same way;
 * - with `themes` granted to Northwind (a module override, as staff give
 *   it on its admin page, ended after), Quiet is taken and saved.
 *
 * Which styles are free is the live catalogue's (`freeStyles`), and
 * whether the plan opens the rest is Northwind's plan: the spec reads both
 * from the site's own `styleAccess` and skips, saying why, where the stack
 * makes Quiet free or Northwind's plan already includes `themes`.
 *
 * @serial: it changes Northwind's flags, its plan overrides and its site
 * style.
 */

interface SiteView {
    style: { look?: string; fontPair?: string };
    styleOptions: { fontPairs?: { key: string; name: string }[] };
    styleAccess?: {
        free: { looks: string[]; fontPairs: string[] };
        paidIncluded: boolean;
    };
}

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

/** Northwind's editor on its site, Brand open, on the page's own clock. */
async function openEditor(page: Page, siteId: string, phone: boolean) {
    await useSession(page, "owner");
    // The style autosave waits 700ms: on the page's own clock, so the spec
    // can run past it and know a save would have gone.
    await page.clock.install();
    await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
    await page.goto(`${urls.APP_URL}/sites/${siteId}`);
    await openBrand(page, phone);
}

/** The looks' gallery behind the Look card's Change (DEC-184). */
async function gallery(page: Page) {
    const dialog = page.getByRole("dialog", { name: "Change look" });
    if (!(await dialog.isVisible())) {
        await page.locator("[data-look-change]").click();
    }
    await expect(dialog).toBeVisible();
    return dialog;
}

/** The look in force, as the Look card says it. */
const lookCard = (page: Page) => page.locator("[data-look-current]");

/** Every style save the editor sends that names `id`: a server action. */
function savesNaming(page: Page, id: string): string[] {
    const saves: string[] = [];
    page.on("request", (req) => {
        const body = req.postData() ?? "";
        if (
            req.method() === "POST" &&
            req.headers()["next-action"] &&
            body.includes(id)
        ) {
            saves.push(body);
        }
    });
    return saves;
}

test.describe("free and paid styles", { tag: "@serial" }, () => {
    test("refuses Quiet in place on a plan without themes, Classic staying", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        const enforced = await overrideNorthwindFlag(
            browser,
            "PLAN_ENFORCEMENT",
            testInfo,
        );
        try {
            const site = await look.owner.get<SiteView>(
                `/sites/${look.siteId}`,
            );
            const access = site.styleAccess;
            test.skip(
                !access ||
                    access.paidIncluded ||
                    access.free.looks.includes("quiet"),
                "Needs a catalogue where Quiet is paid and a Northwind plan without Themes, fonts and templates",
            );

            // The API refuses the save the panel refuses.
            const refused = await look.saveLook("quiet");
            expect(refused.status(), await refused.text()).toBe(403);
            expect(await refused.text()).toContain("MODULE_LOCKED");

            await openEditor(page, look.siteId, phone);
            const saves = savesNaming(page, '"quiet"');
            const looks = await gallery(page);
            const classic = looks.locator('[data-look-choice="classic"]');
            const quiet = looks.locator('[data-look-choice="quiet"]');
            await expect(classic).toHaveAttribute("aria-checked", "true");
            // One "Paid plans" mark for the group, in the gallery's foot.
            await expect(classic).not.toContainText("Paid plans");
            await expect(looks).toContainText(/Paid plans.*Quiet/);

            await quiet.click();
            // Refused: the gallery stays open, Classic chosen, the line in
            // its foot.
            await expect(quiet).toHaveAttribute("aria-checked", "false");
            await expect(classic).toHaveAttribute("aria-checked", "true");
            const line = page.locator("[data-paid-refusal]");
            await expect(line).toHaveCount(1);
            await expect(looks.locator("[data-paid-refusal]")).toContainText(
                "Quiet comes with a paid plan",
            );
            // Closed, the same line sits under the Look card.
            await page.keyboard.press("Escape");
            await expect(looks).toHaveCount(0);
            await expect(line).toHaveCount(1);
            await expect(line).toContainText("Quiet comes with a paid plan");
            await expect(lookCard(page)).toHaveAttribute(
                "data-look-current",
                "classic",
            );
            // Past the autosave's wait: a save of Quiet would have been sent
            // by now. None was, and the API still holds Classic.
            await page.clock.runFor(2_000);
            expect(saves).toEqual([]);
            const after = await look.owner.get<SiteView>(
                `/sites/${look.siteId}`,
            );
            expect(after.style.look).toBeUndefined();
        } finally {
            await enforced.restore();
            await look.restore();
        }
    });

    test("refuses a paid typeface in place", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        const enforced = await overrideNorthwindFlag(
            browser,
            "PLAN_ENFORCEMENT",
            testInfo,
        );
        try {
            const site = await look.owner.get<SiteView>(
                `/sites/${look.siteId}`,
            );
            const access = site.styleAccess;
            const had = site.style.fontPair ?? "system";
            const paid = (site.styleOptions.fontPairs ?? []).find(
                (p) => !access?.free.fontPairs.includes(p.key) && p.key !== had,
            );
            test.skip(
                !access || access.paidIncluded || !paid,
                "Needs a catalogue with a paid typeface and a Northwind plan without Themes, fonts and templates",
            );
            if (!access || !paid) return;

            await openEditor(page, look.siteId, phone);
            const saves = savesNaming(page, paid.key);

            // A paid typeface: under "Paid plans" in the search behind
            // Change, refused in place (the search stays open), nothing saved.
            await page.locator("[data-typeface-change]").click();
            const typeface = page.getByRole("dialog", { name: "Typeface" });
            const option = typeface
                .locator("[cmdk-group]", { hasText: "Paid plans" })
                .locator(`[data-typeface="${paid.key}"]`);
            await expect(option).toBeVisible();
            await option.click();
            await expect(typeface).toBeVisible();
            const line = page.locator("[data-paid-refusal]");
            await expect(line).toHaveCount(1);
            await expect(line).toContainText(
                `${paid.name} comes with a paid plan`,
            );
            await page.clock.runFor(2_000);
            const current = page.locator("[data-typeface-current]");
            await expect(current).toHaveAttribute("data-typeface-current", had);
            expect(saves).toEqual([]);
            const after = await look.owner.get<SiteView>(
                `/sites/${look.siteId}`,
            );
            expect(after.style.fontPair ?? "system").toBe(had);
        } finally {
            await enforced.restore();
            await look.restore();
        }
    });

    test("takes Quiet on a plan with themes", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(150_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        const enforced = await overrideNorthwindFlag(
            browser,
            "PLAN_ENFORCEMENT",
            testInfo,
        );
        const themes = await grantNorthwindThemes(browser, testInfo);
        try {
            const site = await look.owner.get<SiteView>(
                `/sites/${look.siteId}`,
            );
            expect(site.styleAccess?.paidIncluded).toBe(true);

            await openEditor(page, look.siteId, phone);
            const looks = await gallery(page);
            const quiet = looks.locator('[data-look-choice="quiet"]');
            // Still marked: a paid look is marked on every plan.
            await expect(looks).toContainText(/Paid plans.*Quiet/);
            await quiet.click();
            // Taken: the gallery closes and the card says Quiet.
            await expect(looks).toHaveCount(0);
            await expect(lookCard(page)).toHaveAttribute(
                "data-look-current",
                "quiet",
            );
            await expect(page.locator("[data-paid-refusal]")).toHaveCount(0);
            await page.clock.runFor(1_000);
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
        } finally {
            await themes.restore();
            await enforced.restore();
            await look.restore();
        }
    });
});
