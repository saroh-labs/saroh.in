// @covers app:/sites api:sites site:/
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Test releases in the site editor (DEC-071, T11): make one, schedule it,
 * see the top bar say so, cancel it, go live now, and find the release's own
 * heading on the live site.
 *
 * `@serial`: it goes live on Northwind's one site (ADR-006), which every
 * other site spec reads. It owns what it changes and puts it back — the
 * draft's sections as they were, and the version that was live before.
 */

const renderer = new URL(urls.RENDERER_URL);
const LIVE = `${renderer.protocol}//northwind.${renderer.host}`;

interface Section {
    type: string;
    contractVersion: number;
    content: unknown;
    hidden?: boolean;
    key?: string;
}

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 760;

/** The phone's "Status, view and publish" menu, opened until it shows. */
async function openPhoneMenu(page: Page, inside: string | RegExp) {
    const target = page
        .getByRole("dialog")
        .getByRole("button", { name: inside })
        .or(page.getByRole("button", { name: inside }).locator("visible=true"))
        .first();
    await expect(async () => {
        if (!(await target.isVisible())) {
            await page
                .getByRole("button", { name: "Status, view and publish" })
                .click();
        }
        await expect(target).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    return target;
}

/** "Make a test release": the split's main half, or the phone's menu. */
async function openMake(page: Page) {
    const sheet = page.getByRole("dialog", { name: "Make a test release" });
    await expect(async () => {
        if (onPhone(page)) {
            await (await openPhoneMenu(page, "Make a test release")).click();
        } else {
            await page
                .getByRole("group", { name: "Test release" })
                .getByRole("button", { name: "Test release", exact: true })
                .click();
        }
        await expect(sheet).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    return sheet;
}

/** The Test releases panel, opened from the split's menu or the phone's. */
async function openPanel(page: Page) {
    const panel = page.getByRole("dialog", { name: "Test releases" });
    if (await panel.isVisible()) return panel;
    if (onPhone(page)) {
        await (await openPhoneMenu(page, /^Test releases/)).click();
    } else {
        await page
            .getByRole("button", { name: "More test release actions" })
            .click();
        await page.getByRole("menuitem", { name: /^Test releases/ }).click();
    }
    await expect(panel).toBeVisible();
    return panel;
}

/** "2026-10-01" for an instant, in a zone. */
function dayIn(at: Date, zone: string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(at);
}

/**
 * Pick tomorrow, in the business's zone, in the sheet's date picker. The
 * picker opens on the sheet's default day (the next half hour at least an
 * hour ahead), so tomorrow may be next month's page, or already chosen.
 */
async function pickTomorrow(page: Page, sheet: Locator, zone: string) {
    const tomorrow = dayIn(new Date(Date.now() + 86_400_000), zone);
    const field = sheet.getByLabel("Date");
    // The day the field shows ("1 Oct 2026"), as YYYY-MM-DD.
    const shown = new Date(`${(await field.innerText()).trim()} 12:00 UTC`);
    const opened = shown.toISOString().slice(0, 10);
    if (opened === tomorrow) return;
    await field.click();
    const calendar = page.locator("[data-radix-popper-content-wrapper]");
    if (tomorrow.slice(0, 7) !== opened.slice(0, 7)) {
        await calendar.getByRole("button", { name: /next month/i }).click();
    }
    const day = String(Number(tomorrow.slice(8, 10)));
    await calendar
        .locator('button[name="day"]:not(.day-outside)')
        .getByText(day, { exact: true })
        .click();
    await expect(calendar).toBeHidden();
}

test.describe("test releases in the editor (T11)", { tag: "@serial" }, () => {
    test("make, schedule, cancel and go live; the live site shows it", async ({
        page,
    }, testInfo) => {
        test.setTimeout(180_000);
        await useSession(page);
        const nw = northwind(page.request);
        const sites =
            await nw.get<{ id: string; subdomain: string | null }[]>("/sites");
        const siteId = sites.find((s) => s.subdomain === "northwind")?.id;
        expect(siteId, "Northwind has its site at northwind").toBeTruthy();
        const site = await nw.get<{
            currentPublicationId: string | null;
            pages: { id: string; isHome: boolean }[];
        }>(`/sites/${siteId}`);
        const home = site.pages.find((p) => p.isHome) ?? site.pages[0];
        // The zone a schedule is read in: the business's (T10).
        const { zone } = await nw.get<{ zone: string }>(
            `/sites/${siteId}/test-releases`,
        );
        const draftPath = `/sites/${siteId}/pages/${home.id}/draft`;
        const before = await nw.get<{
            revision: number;
            sections: Section[];
        }>(draftPath);
        const original = before.sections.map(
            ({ type, contractVersion, content, hidden, key }) => ({
                type,
                contractVersion,
                content,
                hidden,
                key,
            }),
        );

        // The release's own heading, at the top of the draft it freezes.
        const tag = stamp(testInfo);
        const heading = `Release heading ${tag}`;
        const name = `E2E go-live ${tag}`;
        await nw.put(`${draftPath}/sections`, {
            revision: before.revision,
            sections: [
                { type: "hero", contractVersion: 1, content: { heading } },
                ...original,
            ],
        });

        try {
            await page.goto(`${urls.APP_URL}/open/${NORTHWIND_ORG}`);
            await page.goto(`${urls.APP_URL}/sites/${siteId}`);

            // Make it, with a name; the link shows once.
            const make = await openMake(page);
            await make.getByLabel("Name").fill(name);
            await make
                .getByRole("button", { name: "Make test release" })
                .click();
            const made = page.getByRole("dialog", { name: `${name} is ready` });
            await expect(made).toBeVisible({ timeout: 30_000 });
            await expect(made.locator("[data-release-link]")).toContainText(
                "test--northwind",
            );
            await made.getByRole("button", { name: "Done" }).click();

            // Closing shows it in the panel, ready.
            const panel = page.getByRole("dialog", { name: "Test releases" });
            await expect(panel).toBeVisible();
            const row = panel.getByRole("listitem", { name });
            await expect(row).toContainText("Ready");

            // Schedule it for tomorrow, in the business's zone.
            await row.getByRole("button", { name: "Schedule…" }).click();
            const goLive = page.getByRole("dialog", {
                name: `Go live with ${name}`,
            });
            await expect(goLive).toBeVisible();
            await expect(
                goLive.getByRole("radio", { name: "At a date and time" }),
            ).toHaveAttribute("aria-checked", "true");
            await pickTomorrow(page, goLive, zone);
            await goLive
                .getByRole("button", { name: "Schedule go-live" })
                .click();
            await expect(goLive).toBeHidden({ timeout: 30_000 });
            await expect(row).toContainText("Scheduled");
            await expect(row).toContainText(/Goes live tomorrow, /);

            // The top bar says so.
            await page.keyboard.press("Escape");
            await expect(panel).toBeHidden();
            const readout = new RegExp(`Going live tomorrow, .* · ${name}`);
            if (onPhone(page)) {
                await openPhoneMenu(page, "Preview");
            }
            await expect(
                page.getByText(readout).locator("visible=true").first(),
            ).toBeVisible();
            if (onPhone(page)) await page.keyboard.press("Escape");

            // Cancel it: ready again.
            const panelAgain = await openPanel(page);
            const rowAgain = panelAgain.getByRole("listitem", { name });
            await rowAgain
                .getByRole("button", { name: "Cancel schedule" })
                .click();
            await expect(rowAgain).toContainText("Ready");
            await expect(page.getByText(readout)).toHaveCount(0);

            // Go live now: it says what it replaces.
            await rowAgain.getByRole("button", { name: "Go live…" }).click();
            await expect(goLive).toBeVisible();
            await expect(goLive).toContainText(
                /It replaces the version that's been live since|Nothing is live yet/,
            );
            await goLive.getByRole("button", { name: "Go live now" }).click();
            await expect(
                page
                    .getByText(`“${name}” is live.`, { exact: false })
                    .locator("visible=true")
                    .first(),
            ).toBeVisible({ timeout: 30_000 });
            await expect(
                panelAgain.getByRole("listitem", { name }),
            ).toHaveCount(0);
            await expect(panelAgain.getByLabel("Earlier")).toContainText(name);

            // The live site shows the release's own heading.
            await expect
                .poll(
                    async () => {
                        const res = await page.request.get(`${LIVE}/`);
                        return (await res.text()).includes(heading);
                    },
                    { timeout: 30_000 },
                )
                .toBe(true);
        } finally {
            // Put back what this changed: the draft's sections, and the
            // version that was live before.
            const now = await nw.get<{ revision: number }>(draftPath);
            await nw.put(`${draftPath}/sections`, {
                revision: now.revision,
                sections: original,
            });
            if (site.currentPublicationId) {
                await nw.post(
                    `/sites/${siteId}/publications/${site.currentPublicationId}/restore`,
                );
            }
        }
    });
});
