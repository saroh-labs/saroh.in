// @covers app:/sites/[siteId]/write/[postId] api:content
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Publish post and the post's History (plan 2026-11-20-002 U17, U18;
 * `blogdesk/WXWPublish`, `WXWHistory`, `blogphone/WXYPublish`), behind
 * `NEXT_PUBLIC_WEBSITE_AREA`. A post goes live on its own from its sheet,
 * then the sheet is Tell people; a change after that is listed against the
 * live copy and can go live later instead; History lists the published copy
 * tagged Live. Owns its post: a stamped title, deleted at the end.
 */

interface SiteRow {
    id: string;
}

test("Publish post: now, Tell people, then later; History shows the live copy", async ({
    page,
}, testInfo) => {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const api = northwind(page.request);
    const site = (await api.get<SiteRow[]>("/sites")).at(0);
    test.skip(!site, "Northwind has no website.");
    if (!site) return;

    const title = `Publish post ${stamp(testInfo)}`;
    const made = await api.post<{ id: string }>(`/sites/${site.id}/posts`, {
        title,
        excerpt: "What to expect at a trial.",
        content: "<p>A trial is a rehearsal for the day.</p>",
    });
    try {
        await page.goto(`/sites/${site.id}/posts/${made.id}`);
        test.skip(
            !page.url().includes(`/write/${made.id}`),
            "NEXT_PUBLIC_WEBSITE_AREA is off: today's post editor",
        );
        const phone = testInfo.project.name.startsWith("phone");
        test.skip(phone, "The phone post editor mounts these sheets (U16).");

        const chip = page.locator("[data-status-chip]");
        await expect(chip).toHaveText("Not live yet");

        // Now: goes live alone, then Tell people.
        await page
            .locator("[data-post-bar]")
            .getByRole("button", { name: "Publish post" })
            .click();
        const sheet = page.getByRole("dialog", { name: "Publish this post" });
        await expect(sheet).toContainText(
            "Goes live now, on its own. Site changes waiting stay waiting.",
        );
        await expect(sheet).toContainText("Short description is set");
        await expect(
            sheet.getByRole("button", { name: "Leave out" }),
        ).toHaveCount(0);
        await sheet.getByRole("button", { name: "Publish post" }).click();
        const told = page.getByRole("dialog", { name: "Live now" });
        await expect(told.locator("[data-tell-people]")).toBeVisible({
            timeout: 15_000,
        });
        await expect(told).toContainText("WhatsApp status");
        await told.getByRole("button", { name: "Done" }).click();
        await expect(chip).toHaveText("Live");

        // A change waits, and is listed against the live copy.
        await page
            .getByRole("textbox", { name: "Post title" })
            .fill(`${title}, again`);
        await expect(chip).toHaveText("Live · 1 change waiting");
        await chip.click();
        await expect(sheet).toContainText("1 change goes live");
        await expect(sheet).toContainText("Title");

        // Later: at a day and time in the business's zone.
        await sheet.getByRole("radio", { name: /Later/ }).click();
        await expect(sheet).toContainText("your business's time zone");
        await sheet.getByRole("button", { name: "Schedule" }).click();
        await expect(sheet).toHaveCount(0, { timeout: 15_000 });

        // History: the published copy, tagged Live.
        await page.getByRole("button", { name: "History" }).click();
        const versions = page.getByRole("region", { name: "Versions" });
        await expect(
            versions.locator("[data-version]").filter({ hasText: "Live" }),
        ).toHaveCount(1, { timeout: 15_000 });
        await versions
            .locator("[data-version]")
            .filter({ hasText: "Live" })
            .click();
        await expect(
            page.getByRole("dialog", { name: "Version" }),
        ).toContainText("Comparing");

        await expect(
            page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).resolves.toBe(true);
    } finally {
        await api.delete(`/sites/${site.id}/posts/${made.id}`);
    }
});
