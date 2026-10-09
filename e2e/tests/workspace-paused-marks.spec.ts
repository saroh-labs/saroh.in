// @covers app:/commerce/products/[productId] app:/commerce/products app:/sites/[siteId] app:/settings/people api:billing api:staff
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Where else the workspace marks what a move to a lower plan paused (#800):
 * a paused product's page and its quick look say "Paused" and why, and are
 * read-only as the Editor is; a paused website says so under its header;
 * Team lists the people on the diary with no login who take no new
 * bookings. Read-only: it opens pages and changes nothing.
 *
 * Runs only on a stack prepared for it, as `workspace-paused-by-plan.spec`
 * does (`E2E_PAUSED_ORG=<organization id>`): a business the demo owner owns
 * with `PLAN_ENFORCEMENT` on, on the catalogue, its `MOVE_DOWN` claim dated
 * more than 7 days back, and more products, websites and diary people than
 * its plan includes. A part the business isn't over is skipped. Never Rye
 * or Pulse (read-only demo stores).
 */

const ORG = process.env.E2E_PAUSED_ORG ?? "";

interface PausedRead {
    state: "paused" | "pending" | "none";
    people: { id: string; kind: string; label: string }[] | null;
    products: { cut: unknown; count: number };
    sites: { id: string; name: string }[] | null;
}

async function pausedRead(page: Page): Promise<PausedRead> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${ORG}/billing/paused`,
        { headers: { origin: urls.APP_URL, "x-organization-id": ORG } },
    );
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as PausedRead;
}

test.describe("workspace: the marks a lower plan's pause leaves", () => {
    test.skip(!ORG, "Needs a prepared paused business (E2E_PAUSED_ORG)");

    test.beforeEach(async ({ page }) => {
        await useSession(page, "owner");
        await page.goto(`/open/${ORG}`);
    });

    test("a paused product's quick look and page say Paused and why, and offer no edit", async ({
        page,
    }) => {
        const read = await pausedRead(page);
        test.skip(read.products.count === 0, "No product is paused");
        // The list is newest first: the oldest, paused, are at the end.
        await page.goto("/commerce/products?sort=created-asc");
        const row = page
            .getByRole("row")
            .filter({ has: page.getByText("Paused", { exact: true }) })
            .first();
        await row.click();
        const look = page.getByRole("dialog");
        await expect(look.getByText("Paused", { exact: true })).toBeVisible();
        await expect(
            look
                .getByRole("note")
                .filter({ hasText: "This product is paused." }),
        ).toBeVisible();
        await expect(
            look.getByRole("button", { name: /Publish|Sell again/ }),
        ).toHaveCount(0);

        await look.getByRole("link", { name: "Open product page" }).click();
        await expect(
            page
                .getByRole("note")
                .filter({ hasText: "This product is paused." }),
        ).toBeVisible();
        await expect(
            page.getByRole("link", { name: "Edit product" }),
        ).toHaveCount(0);
    });

    test("a paused website says Paused and why under its header", async ({
        page,
    }) => {
        const read = await pausedRead(page);
        const site = read.sites?.[0];
        test.skip(!site, "No website is paused");
        await page.goto(`/sites/${site?.id}/pages`);
        await expect(page.getByText("Paused", { exact: true })).toBeVisible();
        await expect(
            page
                .getByRole("note")
                .filter({ hasText: "This website is paused." }),
        ).toBeVisible();
    });

    test("Team lists the paused diary people, each tagged, with why", async ({
        page,
    }) => {
        const read = await pausedRead(page);
        const diary = (read.people ?? []).filter((p) => p.kind === "diary");
        test.skip(diary.length === 0, "No diary person is paused");
        await page.goto("/settings/people");
        const section = page.getByRole("region", {
            name: "Paused on the diary",
        });
        for (const p of diary) {
            await expect(section.getByText(p.label)).toBeVisible();
        }
        await expect(section.getByRole("note")).toContainText(
            "take no new bookings. Bookings already made are kept.",
        );
        // Over the limit, not at it; and no card claiming everyone keeps
        // access, nor a diary invite whose login would be paused.
        await expect(
            page.getByText("the team is over its plan's limit."),
        ).toBeVisible();
        await expect(page.getByText(/keeps access/)).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Invite someone on the diary" }),
        ).toHaveCount(0);
    });

    test("never sideways at the project's width", async ({ page }) => {
        await page.goto("/settings/people");
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);
    });
});
