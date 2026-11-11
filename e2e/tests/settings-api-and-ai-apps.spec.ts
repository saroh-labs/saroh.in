// @covers app:/open app:/settings/developers api:api-keys api:outbound-webhooks api:mcp api:rate-limits api:feature-flags api:admin
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { grantNorthwindApi, switchOnNorthwind } from "../fixtures/api-grant";
import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Settings › API and AI apps (plan 2026-11-10-001, U14), desk and phone:
 * the Keys tab locked on a plan without keys; a key made, shown once,
 * then only its start; Edit what it can do (name and AI switch); Revoke
 * asking first; a named webhook address added, a test sent showing in its
 * log, and a test still sent once the address is turned off; a Member with no
 * Keys tab; and on a phone
 * the tabs as a list. Everything is made on Northwind for the test.
 *
 * @serial: it switches the API's surfaces on for Northwind and grants its
 * plan rows, which every API spec reads; afterEach ends the grant.
 */

const isPhone = (testInfo: TestInfo) =>
    testInfo.project.name.startsWith("phone");

async function openArea(page: Page, tab = "") {
    await page.goto(`/open/${NORTHWIND_ORG}`);
    await page.goto(`/settings/developers${tab}`);
}

let api: { restore: () => Promise<void> } | undefined;
test.afterEach(async () => {
    await api?.restore();
    api = undefined;
});

test(
    "a plan without keys sees Connections locked",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        await switchOnNorthwind(browser, "API_SECRET", testInfo);
        await useSession(page);
        await openArea(page, "/keys");
        await expect(page.locator('[data-state="plan"]')).toBeVisible();
        await expect(page.getByRole("button", { name: "New key" })).toHaveCount(
            0,
        );
    },
);

test(
    "an Owner makes a key, sees it once, and revokes it after asking",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        const name = `E2E key ${stamp(testInfo)}`;
        await switchOnNorthwind(browser, "API_SECRET", testInfo);
        api = await grantNorthwindApi(browser, testInfo);
        await useSession(page);
        await openArea(page, "/keys");

        await pressUntil(
            page.getByRole("button", { name: "New key" }).first(),
            page.getByRole("dialog", { name: "New key" }),
        );
        const sheet = page.getByRole("dialog", { name: "New key" });
        await sheet.getByLabel("Name").fill(name);
        await sheet.getByRole("button", { name: "Create key" }).click();

        const once = page.getByRole("dialog", { name: "Copy your key now" });
        const shown = once.locator("[data-secret-once]");
        await expect(shown).toHaveText(/^sk_live_[0-9A-Za-z]{43}$/);
        const token = (await shown.textContent()) ?? "";
        await once.getByRole("button", { name: "Copy key" }).click();
        await once.getByRole("button", { name: "I've saved it" }).click();
        await expect(once).toBeHidden();

        // Reload: only the key's start is ever shown again.
        await page.reload();
        const row = page.getByRole("button", { name: `Open ${name}` });
        await expect(row).toBeVisible();
        await expect(page.getByText(token)).toHaveCount(0);
        await expect(row).toContainText(token.slice(0, "sk_live_".length + 4));

        await row.click();
        // Edit what it can do: a new name, and the AI switch on.
        const renamed = `${name} renamed`;
        await page
            .getByRole("dialog", { name })
            .getByRole("button", { name: "Edit what it can do" })
            .click();
        const edit = page.getByRole("dialog", { name: "Edit what it can do" });
        await edit.getByLabel("Name").fill(renamed);
        await edit.getByText("Let AI apps use this key").click();
        await edit.getByRole("button", { name: "Save" }).click();
        await expect(edit).toBeHidden();
        const after = page.getByRole("button", { name: `Open ${renamed}` });
        await expect(after).toContainText("AI apps");
        await after.click();
        const detail = page.getByRole("dialog", { name: renamed });
        await detail.getByRole("button", { name: "Revoke" }).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("stops working now");
        await confirm.getByRole("button", { name: "Revoke key" }).click();
        await expect(
            page.getByRole("button", { name: `Open ${renamed}` }),
        ).toHaveCount(0);
    },
);

test(
    "Send a test shows a message in an address's log, on or off",
    { tag: "@serial" },
    async ({ browser, page }, testInfo) => {
        await switchOnNorthwind(browser, "API_WEBHOOKS", testInfo);
        api = await grantNorthwindApi(browser, testInfo);
        await useSession(page);
        await openArea(page, "/webhooks");

        const address = `https://example.com/saroh-e2e-${Date.now()}`;
        await pressUntil(
            page.getByRole("button", { name: "Add an address" }).first(),
            page.getByRole("dialog", { name: "Add an address" }),
        );
        const sheet = page.getByRole("dialog", { name: "Add an address" });
        const label = `E2E sync ${stamp(testInfo)}`;
        await sheet.getByLabel("Name").fill(label);
        await sheet.getByLabel("Address").fill(address);
        await sheet.getByRole("button", { name: "Add address" }).click();
        const once = page.getByRole("dialog", {
            name: "Copy your signing secret now",
        });
        await expect(once.locator("[data-secret-once]")).toHaveText(/\S{16,}/);
        await once.getByRole("button", { name: "Copy secret" }).click();
        await once.getByRole("button", { name: "I've saved it" }).click();

        const row = page.getByRole("button", { name: `Open ${label}` });
        await expect(row).toContainText("example.com");
        await row.click();
        const detail = page.getByRole("dialog", { name: label });
        await detail.getByRole("button", { name: "Send a test" }).click();
        await expect(
            detail.locator("[data-delivery-log] li").first(),
        ).toContainText("Test message");

        // Turned off, a test still goes (one that gets through turns it on).
        await detail.getByText("Sending", { exact: true }).click();
        await detail.getByRole("button", { name: "Save" }).click();
        await expect(detail).toBeHidden();
        await row.click();
        await expect(
            detail.getByText("Off. Turns on once a test gets through."),
        ).toBeVisible();
        await detail.getByRole("button", { name: "Send a test" }).click();
        await expect(detail.locator("[data-delivery-log] li")).toHaveCount(2);

        // Put it away.
        await detail.getByRole("button", { name: "Remove address" }).click();
        await page
            .getByRole("alertdialog")
            .getByRole("button", { name: "Remove address" })
            .click();
        await expect(detail).toBeHidden();
    },
);

test("a Member sees no Connections tab", async ({ page }, testInfo) => {
    await useSession(page, "northwindMember");
    await openArea(page, isPhone(testInfo) ? "" : "/usage");
    const nav = page.getByRole("navigation", { name: "API and AI apps" });
    await expect(
        nav.getByRole("link", { name: /AI assistants/ }),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: /Connections/ })).toHaveCount(0);
    // Its address shows nothing to make keys with.
    await page.goto("/settings/developers/keys");
    await expect(page.getByRole("button", { name: "New key" })).toHaveCount(0);
});

test("on a phone the tabs are a list, each with a way back", async ({
    page,
}, testInfo) => {
    test.skip(!isPhone(testInfo), "the desk has a strip of tabs");
    await useSession(page);
    await openArea(page);
    const list = page.getByRole("navigation", { name: "API and AI apps" });
    await list.getByRole("link", { name: /Usage/ }).click();
    await expect(page).toHaveURL(/\/settings\/developers\/usage$/);
    await page.getByRole("link", { name: "Back to API and AI apps" }).click();
    await expect(page).toHaveURL(/\/settings\/developers$/);
});
