// @covers admin:/businesses api:admin
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * A business's page in the operator console (admin plan U2): a header over
 * one address per tab. Staff is Sam (`people.staff`), a Platform owner by a
 * recorded grant, with no support session open on Northwind — so the tabs
 * that read the business's own details ask for one inside the tab, while
 * the header and Overview stand without it.
 *
 * Reads only: no support session is opened and nothing is changed.
 */
const ADMIN = urls.ADMIN_URL;
const PAGE = `${ADMIN}/businesses/${NORTHWIND_ORG}`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TABS = [
    ["Overview", "overview"],
    ["Modules", "modules"],
    ["Billing", "billing"],
    ["Website and payments", "website"],
    ["Team", "team"],
    ["Notes", "notes"],
    ["History", "history"],
] as const;

test.describe("a business's page", () => {
    test("opens on Overview, which needs no support session", async ({
        page,
    }) => {
        await useSession(page, "staff");
        await page.goto(PAGE);

        await expect(page).toHaveURL(new RegExp(`^${escape(PAGE)}/overview$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // By role: while the tab streams in, its copy waits in a hidden node.
        await expect(
            page.getByRole("heading", { name: "Summary", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "View as the business…" }),
        ).toBeVisible();
        await expect(page.getByText("Not authorized")).toHaveCount(0);
    });

    test("moving through the tabs changes the address", async ({ page }) => {
        await useSession(page, "staff");
        await page.goto(`${PAGE}/overview`);
        const tabs = page.getByRole("navigation", {
            name: "Business sections",
        });

        for (const [label, path] of TABS) {
            const tab = tabs.getByRole("link", { name: label, exact: true });
            await tab.click();
            await expect(page).toHaveURL(
                new RegExp(`^${escape(PAGE)}/${path}$`),
            );
            await expect(tab).toHaveAttribute("aria-current", "page");
            // The header stays over every tab.
            await expect(
                page.getByRole("button", { name: "More actions" }),
            ).toBeVisible();
            // A tab that reads the business's details asks for a session
            // inside itself.
            if (path !== "overview") {
                await expect(
                    page.getByRole("button", { name: "Open support access" }),
                ).toBeVisible();
            }
        }

        // Back goes to the tab before.
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`^${escape(PAGE)}/notes$`));
    });

    test("⋯ More actions holds Copy id and the lifecycle", async ({ page }) => {
        await useSession(page, "staff");
        await page.goto(`${PAGE}/overview`);

        await page.getByRole("button", { name: "More actions" }).click();
        const menu = page.getByRole("menu");
        await expect(
            menu.getByRole("menuitem", { name: "Copy id" }),
        ).toBeVisible();
        await expect(
            menu.getByRole("menuitem", { name: "Suspend…" }),
        ).toBeVisible();
        await expect(
            menu.getByRole("menuitem", { name: "Schedule deletion…" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
    });

    test("the page fits the screen, and the tabs scroll on a phone", async ({
        page,
    }, testInfo) => {
        await useSession(page, "staff");
        await page.goto(`${PAGE}/overview`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const width = page.viewportSize()?.width ?? 0;

        // Nothing wider than the screen (measured against the width set:
        // a phone viewport widens innerWidth to fit an overflow).
        await expect
            .poll(() =>
                page.evaluate(() => ({
                    scroll: document.documentElement.scrollWidth,
                    inner: window.innerWidth,
                })),
            )
            .toEqual({ scroll: width, inner: width });

        if (testInfo.project.name.startsWith("phone")) {
            // Seven tabs don't fit a phone: the strip scrolls sideways
            // inside itself, and the last tab is still one tap away.
            const strip = page.locator("[data-tab-strip] [data-scroll-x]");
            await expect
                .poll(() =>
                    strip.evaluate((el) => el.scrollWidth > el.clientWidth),
                )
                .toBe(true);
            const history = page
                .getByRole("navigation", { name: "Business sections" })
                .getByRole("link", { name: "History", exact: true });
            await history.click();
            await expect(page).toHaveURL(
                new RegExp(`^${escape(PAGE)}/history$`),
            );
        }
    });
});
