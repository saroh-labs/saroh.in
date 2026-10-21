// @covers app:/sites api:sites api:billing
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { overrideNorthwindFlag, setNorthwindLook } from "../fixtures/site-look";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Free and paid looks, typefaces and colourways (DEC-177, #1163).
 *
 * With plan limits enforced for Northwind alone (`PLAN_ENFORCEMENT`, as
 * admin → Flags sets it) and `SITE_LOOKS` on, both put back after: a free
 * look is taken at once; a typeface the catalogue doesn't make free says
 * "Paid plans", and on a plan without "Themes, fonts and templates"
 * choosing it is refused in the panel, the previous one still chosen and
 * one line saying why, and nothing saved.
 *
 * Which typefaces are free is the live catalogue's (`freeStyles`), and
 * whether the plan opens the rest is Northwind's plan: the spec reads both
 * from the site's own `styleAccess` and skips, saying why, where the stack
 * has no paid typeface or Northwind's plan includes them.
 *
 * @serial: it changes Northwind's flags and its site style.
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

test.describe("free and paid styles", { tag: "@serial" }, () => {
    test("takes a free look, refuses a paid typeface in place", async ({
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

            await useSession(page, "owner");
            // The style autosave waits 700ms: on the page's own clock, so
            // the spec can run past it and know a save would have gone.
            await page.clock.install();
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}/sites/${look.siteId}`);
            await openBrand(page, phone);

            // A free look is taken at once.
            const free = access.free.looks[0];
            if (free) {
                const row = page.getByRole("radiogroup", { name: "Look" });
                const choice = row.locator(`[data-look-choice="${free}"]`);
                await choice.click();
                await expect(choice).toHaveAttribute("aria-checked", "true");
                await expect(choice).not.toContainText("Paid plans");
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
                    .toBe(free);
            }

            // Every style save from here on: the editor saves through a
            // server action, whose body carries the style (review #26).
            const saves: string[] = [];
            page.on("request", (req) => {
                const body = req.postData() ?? "";
                if (
                    req.method() === "POST" &&
                    req.headers()["next-action"] &&
                    body.includes(paid.key)
                ) {
                    saves.push(body);
                }
            });

            // A paid typeface: marked, refused in place, nothing saved.
            const typeface = page.getByRole("radiogroup", {
                name: "Typeface",
            });
            const option = typeface.getByRole("radio", {
                name: new RegExp(paid.name),
            });
            await expect(option).toContainText("Paid plans");
            await option.click();
            await expect(option).toHaveAttribute("aria-checked", "false");
            const line = page.locator("[data-paid-refusal]");
            await expect(line).toHaveCount(1);
            await expect(line).toContainText(
                `${paid.name} comes with a paid plan`,
            );
            // Past the autosave's wait: a save of the paid typeface would
            // have been sent by now. None was, and the API still holds the
            // typeface the site had.
            await page.clock.runFor(2_000);
            await expect(option).toHaveAttribute("aria-checked", "false");
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
});
