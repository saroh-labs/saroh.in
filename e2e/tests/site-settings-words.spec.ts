// @covers app:/sites/[siteId]/settings api:sites
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The site's settings name each address apart and call the shop "your
 * online shop" (DEC-069, plan L12): "Web address" for where customers find
 * the site, "Posts path" for where its posts live, and "Your online shop
 * sells from ‹Location›" — never "Saroh address", "Subdomain", "Writing
 * address" or "storefront".
 *
 * On Northwind, reading only: nothing is pressed that saves.
 */

interface SiteRow {
    id: string;
    subdomain: string | null;
}

interface SiteRead {
    sellsFrom?: { storefront: { name: string } | null } | null;
}

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

test("the site's settings say web address, posts path and your online shop", async ({
    page,
}) => {
    await signIn(page);
    const api = northwind(page.request);
    const sites = await api.get<SiteRow[]>("/sites");
    const site = sites.find((s) => s.subdomain);
    test.skip(!site, "Northwind has no website with a web address.");
    if (!site) return;
    const read = await api.get<SiteRead>(`/sites/${site.id}`);

    await page.goto(`/sites/${site.id}/settings`);
    // In tabs, as Settings › Business (owner, 9 Oct): Address opens first.
    const tabs = page.getByRole("tablist", { name: "Website settings" });
    const tab = (name: string) => tabs.getByRole("tab", { name, exact: true });
    await expect(tab("Address")).toHaveAttribute("aria-selected", "true");
    for (const name of ["Search and sharing", "Menu and footer", "Tracking"]) {
        await expect(tab(name)).toBeVisible();
    }
    await expect(
        page
            .getByText("Web address", { exact: true })
            .filter({ visible: true }),
    ).not.toHaveCount(0);
    await expect(page.getByText("Site status", { exact: true })).toHaveCount(0);
    await expect(
        page.getByText(/Saroh address|Subdomain|Writing address|storefront/i),
    ).toHaveCount(0);
    await expect(
        page.getByText(
            /Live as soon as it's saved|Goes live with your next publish/,
        ),
    ).toHaveCount(0);
    // The old in-page list is gone.
    await expect(
        page.getByRole("navigation", { name: "Settings sections" }),
    ).toHaveCount(0);

    // A tab is in the address: chosen, it says so; Back returns.
    await tab("Menu and footer").click();
    await expect(page).toHaveURL(/[?&]section=menu-and-footer\b/);
    await expect(tab("Menu and footer")).toHaveAttribute(
        "aria-selected",
        "true",
    );
    await expect(
        page.getByText("Posts path", { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
        page
            .getByText("Next publish", { exact: true })
            .filter({ visible: true }),
    ).not.toHaveCount(0);
    await page.goBack();
    await expect(tab("Address")).toHaveAttribute("aria-selected", "true");

    // A link opens its tab.
    const sellsFrom = read.sellsFrom?.storefront?.name;
    if (sellsFrom) {
        await page.goto(`/sites/${site.id}/settings?section=shop`);
        await expect(tab("Shop")).toHaveAttribute("aria-selected", "true");
        await expect(
            page
                .getByText(`Your online shop sells from ${sellsFrom}`)
                .filter({ visible: true }),
        ).toHaveCount(1);
    }
});
