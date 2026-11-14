// @covers app:/settings/developers app:/settings/developers/ai
import type { TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * AI assistants with nothing connected (release visibility U14, board
 * VASettingsEmpty), desk and phone: the address is step 1 and Copy puts
 * it on the clipboard; step 2 lists only the apps walked on dev, each
 * Connect opening its own connectors page in a new tab. Read-only: a
 * Member, who sees only their own connections and has none.
 */

const isPhone = (testInfo: TestInfo) =>
    testInfo.project.name.startsWith("phone");

test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(urls.APP_URL).origin,
    });
});

test("nothing connected: copy the address, then pick an app", async ({
    page,
}, testInfo) => {
    await useSession(page, "northwindMember");
    await page.goto(`/open/${NORTHWIND_ORG}`);
    await page.goto("/settings/developers/ai");

    // The address is the API's host with mcp. for api.; a stack whose API
    // has no api. host (CI's localhost) has none, and step 1 is the apps.
    const address = page.getByLabel(/Copy your Saroh address/);
    if (/^https?:\/\/api\./.test(urls.API_URL)) {
        await expect(address).toHaveValue(/^https:\/\/mcp\.[^/]+\/mcp$/);
        const mcp = await address.inputValue();
        await page.getByRole("button", { name: "Copy", exact: true }).click();
        await expect(page.getByText("Copied", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
            mcp,
        );
    } else {
        await expect(page.getByText("Add it in your assistant")).toBeVisible();
        await expect(address).toHaveCount(0);
    }

    const apps = page.locator("[data-ai-app]");
    await expect(apps).toHaveCount(2);
    await expect(
        page.getByRole("link", { name: "Connect Claude (opens in a new tab)" }),
    ).toHaveAttribute("href", "https://claude.ai/settings/connectors");
    await expect(
        page.getByRole("link", {
            name: "Connect ChatGPT (opens in a new tab)",
        }),
    ).toHaveAttribute("target", "_blank");
    await expect(page.locator('[data-ai-app="perplexity"]')).toHaveCount(0);

    // What an assistant can do: beside it at the desk, a button on a phone.
    if (isPhone(testInfo)) {
        await page
            .getByRole("button", { name: "What an assistant can and can’t do" })
            .click();
        await expect(
            page.getByRole("dialog", { name: "What an assistant can do here" }),
        ).toContainText("Cancel or refund anything");
    } else {
        await expect(
            page.getByRole("heading", {
                name: "What an assistant can do here",
            }),
        ).toBeVisible();
    }
});
