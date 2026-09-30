// @covers accounts:/login app:/ app:/open app:/sites api:capabilities api:sites pkg:templates
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * A new site starts from the template for what is being set up (DEC-070,
 * K15). As Asha (`founder`), on businesses the seed gives her with every
 * module rolled out and none on (`packages/database/src/seed/founder.ts`):
 * a business made in a spec has every module dark and can't turn Website
 * on.
 *
 * - The Turn on sheet's Website step says which template, per kind. Read
 *   only, on the three first-run businesses (`FIRST_RUNS`), which
 *   `first-run-kind.spec.ts` reads too: the sheet is opened, never saved.
 * - A site for my work turns Website on and opens on the portfolio, with
 *   its Projects block. On `SITE_STARTS`, one business per browser, since a
 *   business has one website and nothing else reads them.
 */
const FIRST_RUN = {
    BUSINESS: "seed_org_first-run_business",
    SOLO: "seed_org_first-run_solo",
    WORK: "seed_org_first-run_work",
} as const;

/** Asha's business, open on Home. */
async function openHome(page: Page, orgId: string) {
    await useSession(page, "founder");
    await page.goto(`/open/${orgId}`);
    await page.goto("/");
}

/** Home's "Put up a website" card, pressed until the sheet opens. */
async function openWebsiteSheet(page: Page) {
    const card = page
        .getByRole("region", { name: "What will you do first?" })
        .getByRole("button", { name: /^Put up a website/ })
        .first();
    const sheet = page.getByRole("dialog", { name: "Turn on Website" });
    // A press before hydration does nothing.
    await expect(async () => {
        await card.click();
        await expect(sheet).toBeVisible({ timeout: 2_000 });
    }).toPass();
    return sheet;
}

test.describe("a new site starts from the kind's template (DEC-070, K15)", () => {
    for (const [kind, name] of [
        ["BUSINESS", "Starter"],
        ["SOLO", "Personal"],
        ["WORK", "Portfolio"],
    ] as const) {
        test(`the Turn on sheet names the ${name} template for ${kind}`, async ({
            page,
        }) => {
            await openHome(page, FIRST_RUN[kind]);
            const sheet = await openWebsiteSheet(page);
            await expect(sheet).toContainText(
                `Starts from the ${name} template. Change its pages any time.`,
            );
            // The address is the API's prefill, not left blank.
            await expect
                .poll(() => sheet.getByLabel("Web address").inputValue())
                .not.toBe("");
        });
    }

    test("a site for my work opens on the portfolio, with its Projects block", async ({
        page,
    }, testInfo) => {
        const browser = testInfo.project.name.startsWith("phone")
            ? "phone"
            : "desk";
        await openHome(page, `seed_org_site-start_work-${browser}`);
        const sheet = await openWebsiteSheet(page);
        await expect(sheet).toContainText("Starts from the Portfolio template");
        await sheet.getByRole("button", { name: /^Turn on$/ }).click();

        // Website's own screen, then the new site's editor.
        await page.waitForURL(/\/sites\/[^/]+\/pages/, { timeout: 30_000 });
        const id = /\/sites\/([^/]+)\//.exec(page.url())?.[1];
        if (id === undefined) throw new Error(`no site id in ${page.url()}`);
        await expect(page.getByRole("main")).toContainText("/work");
        await page.goto(`/sites/${id}`);
        await expect(
            page
                .getByRole("button", { name: /^Projects block, 2 of 3/ })
                .filter({ visible: true })
                .first(),
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page
                .getByRole("button", { name: /^Enquiry form block, 3 of 3/ })
                .filter({ visible: true })
                .first(),
        ).toBeVisible();
    });
});
