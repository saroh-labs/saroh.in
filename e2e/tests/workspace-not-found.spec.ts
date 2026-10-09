// @covers app:/open app:/[...missing]
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * An address the workspace doesn't have is a 404 inside the workspace: the
 * rail and the account menu stay, so the way on is where it always is.
 * Read-only, on Northwind. The status isn't asserted: the shell's loading
 * state streams 200 before the page says not found, and nothing indexes
 * the workspace.
 */
test("an unknown workspace address is a 404 that keeps the workspace round it", async ({
    page,
}) => {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    for (const path of [
        "/no-such-page-here",
        "/commerce/orders/no/such/page",
    ]) {
        await page.goto(path);
        await expect(
            page.getByRole("heading", { name: "Page not found" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Your account" }),
        ).toBeVisible();
    }
});
