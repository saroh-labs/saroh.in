// @covers app:/sites/[siteId]/overview
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { onPhone } from "../fixtures/reviewer-editor";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * A site's Overview (plan 2026-11-18-001 U4), behind
 * `NEXT_PUBLIC_WEBSITE_AREA`: the web address and status, what the site
 * brought in over the last 7 days, what needs doing and activity, for the
 * owner; the same screen without fix buttons or Review and publish for a
 * reviewer (DEC-200).
 *
 * Read-only: it opens Northwind's Overview and saves nothing.
 */
const noSideScroll = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
    );

const overview = (page: Page) => page.locator("[data-site-overview]");

test.describe("a site's Overview", () => {
    test("the owner sees address, status, results, what needs doing and activity", async ({
        page,
    }) => {
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const sites = await northwind(page.request).get<
            { id: string; subdomain: string | null }[]
        >("/sites");
        const site = sites.find((s) => s.subdomain === "northwind");
        expect(site, "Northwind has its site at northwind").toBeTruthy();

        await page.goto(`/sites/${site?.id ?? ""}/overview`);
        test.skip(
            !page.url().endsWith("/overview"),
            "NEXT_PUBLIC_WEBSITE_AREA is off: Overview forwards to Pages",
        );
        const o = overview(page);
        await expect(
            o.getByRole("heading", { name: "Web address" }),
        ).toBeVisible();
        await expect(
            o.getByRole("heading", {
                name: "What the site brought in, last 7 days",
            }),
        ).toBeVisible();
        await expect(
            o.getByRole("heading", { name: "What needs doing" }),
        ).toBeVisible();
        await expect(
            o.getByRole("heading", { name: "Activity" }),
        ).toBeVisible();
        // The header is drawn over it, as on every site screen.
        await expect(
            page.getByRole("link", { name: /Open editor/ }).first(),
        ).toBeVisible();
        if (onPhone(page)) {
            // The site home's groups follow on a phone.
            await expect(
                page.getByRole("list", { name: "This site" }),
            ).toBeVisible();
        }
        expect(await noSideScroll(page)).toBe(true);
    });

    test("a reviewer reads it with no fix buttons and no Review and publish", async ({
        page,
    }) => {
        await useSession(page, "reviewer");
        await page.goto("/sites");
        test.skip(
            new URL(page.url()).pathname !== "/sites",
            "NEXT_PUBLIC_WEBSITE_AREA is off: /sites forwards to the editor",
        );
        await page
            .getByRole("list", { name: "Your sites" })
            .getByRole("link")
            .first()
            .click();
        await expect(page).toHaveURL(/\/overview$/);
        const o = overview(page);
        await expect(
            o.getByRole("heading", { name: "What needs doing" }),
        ).toBeVisible();
        await expect(
            o.getByRole("link", { name: "Review and publish" }),
        ).toHaveCount(0);
        await expect(o.locator("[data-needs-doing] a")).toHaveCount(0);
        // Insights is not theirs to read, so no results are shown.
        await expect(
            o.getByRole("heading", {
                name: "What the site brought in, last 7 days",
            }),
        ).toHaveCount(0);
        expect(await noSideScroll(page)).toBe(true);
    });
});
