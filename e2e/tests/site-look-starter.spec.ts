// @covers app:/sites api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { lookGallery, openFromPill } from "../fixtures/phone-editor";
import { useSession } from "../fixtures/sessions";
import { setNorthwindLook } from "../fixtures/site-look";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A look's Preview and its starter content (DEC-182).
 *
 * The Northwind owner, with `SITE_LOOKS` on for Northwind alone
 * (`fixtures/site-look.ts`), opens Live's Preview in Website › Style: it
 * draws Prana Yoga, its board's sample business, not Northwind's own
 * page. "Use this look with its starter content" says what it replaces
 * first; going on copies Prana's pages into the draft and sets Live, the
 * editor starts afresh on it, and the check before publishing names the
 * sample words left. Undo in the toast puts the draft back as it was.
 *
 * Amended 22 Oct 2026: "Fill in my details" is on in the confirm unless
 * unticked; "Bring in my details" fills the samples later; and Previous
 * versions rolls the draft back to how it was before the copy.
 *
 * Nothing is published. @serial: it changes Northwind's draft, its pages,
 * its menu and its style, and puts every one back in `finally` whatever
 * the Undo or the roll back did.
 */

interface PageRow {
    id: string;
    path: string;
    isHome: boolean;
}

interface SiteView {
    style: { look?: string };
    pages: PageRow[];
    navigation: unknown;
}

interface DraftSection {
    type: string;
    contractVersion: number;
    content: unknown;
    hidden?: boolean;
    key?: string;
}

interface Draft {
    revision: number;
    sections: DraftSection[];
}

interface Flags {
    flags: { type: string; message: string }[];
}

/** Website › Style: the rail's Brand tab on a desk, its pill on a phone. */
async function openBrand(page: Page, phone: boolean) {
    if (phone) {
        // The pill's Brand, in its sheet (DEC-185).
        await openFromPill(page, "Brand");
        return;
    }
    const brand = page.getByRole("tab", { name: "Brand" });
    await expect(brand).toBeVisible({ timeout: 30_000 });
    if ((await brand.getAttribute("aria-selected")) !== "true") {
        await brand.click();
    }
}

/** A draft's sections as a save sends them back. */
const asSaved = (sections: DraftSection[]) =>
    sections.map(({ type, contractVersion, content, hidden, key }) => ({
        type,
        contractVersion,
        content,
        hidden: hidden ?? false,
        ...(key ? { key } : {}),
    }));

/** Northwind's site as it was, and how to put it back. */
async function northwindAsItWas(
    browser: Parameters<typeof setNorthwindLook>[0],
    testInfo: Parameters<typeof setNorthwindLook>[2],
) {
    const look = await setNorthwindLook(browser, null, testInfo);
    const nw = look.owner;
    const site = `/sites/${look.siteId}`;
    const before = await nw.get<SiteView>(site);
    const home = before.pages.find((p) => p.isHome);
    if (!home) throw new Error("Northwind's site has no home page");
    const homeDraft = await nw.get<Draft>(`${site}/pages/${home.id}/draft`);
    const pageIds = new Set(before.pages.map((p) => p.id));
    const restore = async () => {
        const now = await nw.get<SiteView>(site);
        for (const p of now.pages) {
            if (!pageIds.has(p.id)) await nw.delete(`${site}/pages/${p.id}`);
        }
        const draft = await nw.get<Draft>(`${site}/pages/${home.id}/draft`);
        await nw.put(`${site}/pages/${home.id}/draft/sections`, {
            sections: asSaved(homeDraft.sections),
            revision: draft.revision,
        });
        await nw.put(`${site}/navigation`, before.navigation ?? { items: [] });
        await look.restore();
    };
    return { nw, site, home, homeDraft, restore };
}

test.describe("a look's starter content", { tag: "@serial" }, () => {
    test("previews Live's Prana Yoga, takes its starter content, and Undo puts the draft back", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(180_000);
        const phone = testInfo.project.name.startsWith("phone");
        const look = await setNorthwindLook(browser, null, testInfo);
        const nw = look.owner;
        const site = `/sites/${look.siteId}`;
        const before = await nw.get<SiteView>(site);
        const home = before.pages.find((p) => p.isHome);
        if (!home) throw new Error("Northwind's site has no home page");
        const homeDraft = await nw.get<Draft>(`${site}/pages/${home.id}/draft`);
        const pageIds = new Set(before.pages.map((p) => p.id));

        try {
            await useSession(page, "owner");
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}${site}?page=${home.id}`);
            await openBrand(page, phone);

            // Live's Preview is on its card in the gallery behind Change
            // (DEC-184), the Look tab itself on a phone (DEC-185).
            await (
                await lookGallery(page, phone)
            )
                .getByRole("button", { name: "Preview Live" })
                .click();
            const preview = page.getByRole("dialog", { name: "Live" });
            await expect(preview).toBeVisible();
            // Prana Yoga, the board's sample business, not Northwind (94399ac1d).
            // A phone opens the Preview at phone width: the page is drawn
            // in the device frame's iframe.
            const showcase = (
                phone
                    ? preview.frameLocator("iframe[data-device-frame]")
                    : preview
            ).locator('[data-look-showcase="prana"]');
            await expect(showcase).toBeVisible({ timeout: 15_000 });
            await expect(showcase).toContainText("Prana Yoga");

            // Said first: what it replaces, and that the words are a sample.
            await preview
                .getByRole("button", {
                    name: "Use this look with its starter content",
                })
                .click();
            const confirm = preview.locator("[data-look-starter-confirm]");
            await expect(confirm).toContainText(
                "is replaced with the Prana Yoga template's.",
            );
            await expect(confirm).toContainText("a sample business's");
            await confirm
                .getByRole("button", {
                    name: "Use Live and its starter content",
                })
                .click();
            await expect(preview).toHaveCount(0);
            await expect(
                page.getByText("Starter content added to your draft."),
            ).toBeVisible();

            // Live in the draft, Prana's home page in it, and the check
            // before publishing names its sample words.
            await expect
                .poll(async () => (await nw.get<SiteView>(site)).style.look)
                .toBe("live");
            await expect
                .poll(async () =>
                    (await nw.get<Flags>(`${site}/flags`)).flags.some((f) =>
                        f.message.includes(
                            "sample words from the Prana Yoga starter",
                        ),
                    ),
                )
                .toBe(true);
            await expect(page.locator("[data-look-current]")).toBeVisible({
                timeout: 30_000,
            });

            // Undo, within the toast's ten seconds.
            await page.getByRole("button", { name: "Undo" }).click();
            await expect(page.getByText("Undone.")).toBeVisible();
            await expect
                .poll(async () => (await nw.get<SiteView>(site)).style.look)
                .toBeUndefined();
            const after = await nw.get<SiteView>(site);
            expect(after.pages.map((p) => p.id).sort()).toEqual(
                [...pageIds].sort(),
            );
            const restored = await nw.get<Draft>(
                `${site}/pages/${home.id}/draft`,
            );
            expect(asSaved(restored.sections)).toEqual(
                asSaved(homeDraft.sections),
            );
        } finally {
            // Whatever the Undo did: no page the copy made, the home page's
            // draft and the menu as they were, then the style and the flag.
            const now = await nw.get<SiteView>(site);
            for (const p of now.pages) {
                if (!pageIds.has(p.id))
                    await nw.delete(`${site}/pages/${p.id}`);
            }
            const draft = await nw.get<Draft>(`${site}/pages/${home.id}/draft`);
            await nw.put(`${site}/pages/${home.id}/draft/sections`, {
                sections: asSaved(homeDraft.sections),
                revision: draft.revision,
            });
            await nw.put(
                `${site}/navigation`,
                before.navigation ?? { items: [] },
            );
            await look.restore();
        }
    });

    test("copies the samples alone, brings the details in after, and rolls back to the draft before", async ({
        browser,
        page,
    }, testInfo) => {
        test.setTimeout(180_000);
        const phone = testInfo.project.name.startsWith("phone");
        const { nw, site, home, homeDraft, restore } = await northwindAsItWas(
            browser,
            testInfo,
        );

        try {
            await useSession(page, "owner");
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}${site}?page=${home.id}`);
            await openBrand(page, phone);

            // Live's Preview is on its card in the gallery behind Change
            // (DEC-184), the Look tab itself on a phone (DEC-185).
            await (
                await lookGallery(page, phone)
            )
                .getByRole("button", { name: "Preview Live" })
                .click();
            const preview = page.getByRole("dialog", { name: "Live" });
            await preview
                .getByRole("button", {
                    name: "Use this look with its starter content",
                })
                .click();
            const confirm = preview.locator("[data-look-starter-confirm]");
            // On unless unticked: here the samples go in alone.
            const fill = confirm.getByRole("checkbox", {
                name: "Fill in my details",
            });
            await expect(fill).toBeChecked();
            await fill.click();
            await expect(fill).not.toBeChecked();
            await confirm
                .getByRole("button", {
                    name: "Use Live and its starter content",
                })
                .click();
            await expect(
                page.getByText("Starter content added to your draft."),
            ).toBeVisible();
            await expect(page.locator("[data-look-current]")).toBeVisible({
                timeout: 30_000,
            });

            // Bring in my details: what Northwind has replaces the samples,
            // or it says there is nothing to bring.
            await page
                .getByRole("button", { name: "Bring in my details" })
                .click();
            await expect(
                page
                    .getByText(/^Brought in your |^Nothing to bring in\.$/)
                    .first(),
            ).toBeVisible({ timeout: 15_000 });
            await expect(page.locator("[data-look-current]")).toBeVisible({
                timeout: 30_000,
            });

            // Previous versions: the draft before the copy, rolled back to
            // after its own confirm.
            await page
                .getByRole("button", { name: "Previous versions" })
                .click();
            const versions = page.locator("[data-draft-versions]");
            const first = versions
                .locator('[data-draft-version="starter-content"]')
                .first();
            await expect(first).toContainText("Before the starter content");
            await first.getByRole("button", { name: "Roll back" }).click();
            await expect(first).toContainText("is kept here");
            await first
                .getByRole("button", { name: "Roll back to this version" })
                .click();
            await expect(
                page.getByText("Your draft is back to that version."),
            ).toBeVisible();
            await expect
                .poll(async () => (await nw.get<SiteView>(site)).style.look)
                .toBeUndefined();
            const restored = await nw.get<Draft>(
                `${site}/pages/${home.id}/draft`,
            );
            expect(asSaved(restored.sections)).toEqual(
                asSaved(homeDraft.sections),
            );
        } finally {
            await restore();
        }
    });
});
