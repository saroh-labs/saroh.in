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
    // The groups are chosen from a side list from 1024px, and from a
    // "Section" select below it; never a second strip of underline tabs
    // under the Website screen's own (owner, 9 Oct).
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    const list = page.getByRole("tablist", { name: "Settings sections" });
    const section = page.getByRole("combobox", { name: "Section" });
    const isOpen = async (name: string) => {
        if (wide) {
            await expect(
                list.getByRole("tab", { name, exact: true }),
            ).toHaveAttribute("aria-selected", "true");
        } else {
            await expect(section).toHaveText(name);
        }
    };
    const choose = async (name: string) => {
        if (wide) {
            await list.getByRole("tab", { name, exact: true }).click();
        } else {
            await section.click();
            await page.getByRole("option", { name, exact: true }).click();
        }
    };
    if (wide) {
        await expect(list).toBeVisible();
        await expect(list).toHaveAttribute("aria-orientation", "vertical");
        await expect(section).toBeHidden();
    } else {
        await expect(section).toBeVisible();
        await expect(list).toBeHidden();
    }
    // Only the Website screen's own tabs are an underline strip.
    await expect(
        page.getByRole("tablist").filter({ visible: true }),
    ).toHaveCount(wide ? 1 : 0);
    await isOpen("Address");

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

    // The group is in the address: chosen, it says so; Back returns.
    await choose("Menu and footer");
    await expect(page).toHaveURL(/[?&]section=menu-and-footer\b/);
    await isOpen("Menu and footer");
    await expect(
        page.getByText("Posts path", { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
        page
            .getByText("Next publish", { exact: true })
            .filter({ visible: true }),
    ).not.toHaveCount(0);
    await page.goBack();
    await isOpen("Address");

    // A link opens its group.
    const sellsFrom = read.sellsFrom?.storefront?.name;
    if (sellsFrom) {
        await page.goto(`/sites/${site.id}/settings?section=shop`);
        await isOpen("Shop");
        await expect(
            page
                .getByText(`Your online shop sells from ${sellsFrom}`)
                .filter({ visible: true }),
        ).toHaveCount(1);
    }
});
