// @covers accounts:/login app:/open app:/leads app:/pipeline api:leads api:pipelines
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * Leads' two views (owner, 10 Oct): the board (`/pipeline`) and the list
 * (`/leads`) are the same leads, so each carries a Board | List switch that
 * marks itself and links to the other. Each keeps its address. Read only.
 */

const NORTHWIND = "seed_org";

test.describe("leads, as a board or a list", () => {
    test("the switch is on both, marks the view and leads to the other", async ({
        page,
    }) => {
        await useSession(page, "owner");
        await page.goto(`/open/${NORTHWIND}`);

        await page.goto("/leads");
        await expect(
            page.getByRole("heading", { level: 1, name: "Leads" }),
        ).toBeVisible();
        const views = page.getByRole("navigation", { name: "Leads view" });
        await expect(views.getByRole("link", { name: "List" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        // The list's own tabs are still there, under the switch.
        await expect(
            page.getByRole("navigation", { name: "Leads or follow-ups" }),
        ).toBeVisible();

        await views.getByRole("link", { name: "Board" }).click();
        await expect(page).toHaveURL(/\/pipeline$/);
        await expect(
            page.getByRole("heading", { level: 1, name: "Pipeline" }),
        ).toBeVisible();
        await expect(
            views.getByRole("link", { name: "Board" }),
        ).toHaveAttribute("aria-current", "page");

        await views.getByRole("link", { name: "List" }).click();
        await expect(page).toHaveURL(/\/leads$/);
    });
});
