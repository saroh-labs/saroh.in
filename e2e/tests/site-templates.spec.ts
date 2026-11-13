// @covers accounts:/login app:/ app:/open app:/sites api:capabilities api:sites pkg:templates
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * A new site starts from the template for what is being set up (DEC-070,
 * K15). As Asha (`founder`), on businesses the seed gives her with every
 * module rolled out and none on (`packages/database/src/seed/founder.ts`):
 * a business made in a spec has every module dark and can't turn Website
 * on.
 *
 * - The Turn on sheet's Website step offers the one template picker
 *   (DEC-216): picture cards, the suggested first, the kind's chosen, and a
 *   card's preview with its own Choose. Read only, on the three first-run businesses (`FIRST_RUNS`), which
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

/**
 * The sheet's template picker (DEC-216) opens on the kind's template, its
 * card first and chosen; its Preview opens the template drawn as the
 * business's site, and Back chooses nothing.
 */
async function expectStartsFrom(sheet: Locator, name: string) {
    const cards = sheet.locator("[data-template-card]");
    const radios = cards.getByRole("radio");
    await expect(radios.first()).toHaveAccessibleName(name);
    await expect(radios.first()).toBeChecked();
    expect(await cards.count()).toBeGreaterThan(1);
    await cards
        .first()
        .getByRole("button", { name: `Preview ${name}` })
        .click();
    const preview = sheet
        .page()
        .getByRole("dialog", { name: `Your site in ${name}` });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("What goes in");
    await preview.getByRole("button", { name: "Back" }).click();
    await expect(preview).toHaveCount(0);
    await expect(radios.first()).toBeChecked();
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
        test(`the Turn on sheet starts ${kind} on the ${name} template`, async ({
            page,
        }) => {
            await openHome(page, FIRST_RUN[kind]);
            const sheet = await openWebsiteSheet(page);
            await expectStartsFrom(sheet, name);
            // The address chosen at setup is said, not asked again: the
            // API's prefill, never blank, and no box to type it in.
            await expect(
                sheet.getByRole("term").filter({ hasText: "Web address" }),
            ).toBeVisible();
            // Beside it, the owner's Change (DEC-069), which opens
            // Settings' dialog over the sheet.
            await expect(
                sheet.getByText(/^[a-z0-9-]+\.saroh\.app$/),
            ).toBeVisible();
            await expect(sheet.getByLabel("Web address")).toHaveCount(0);
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
        await expectStartsFrom(sheet, "Portfolio");
        // Website alone: the button names its template (DEC-216).
        await sheet
            .getByRole("button", { name: /^Turn on with Portfolio$/ })
            .click();

        // A first run lands on the thing itself (`goalHref`): the new
        // site, open in its editor.
        await page.waitForURL(/\/sites\/[^/?#]+$/, { timeout: 30_000 });
        const id = /\/sites\/([^/?#]+)$/.exec(
            new URL(page.url()).pathname,
        )?.[1];
        if (id === undefined) throw new Error(`no site id in ${page.url()}`);
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
        // Its pages are the portfolio's.
        await page.goto(`/sites/${id}/pages`);
        await expect(page.getByRole("main")).toContainText("/work");
    });
});
