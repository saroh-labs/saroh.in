// @covers accounts:/login app:/open app:/settings/modules api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Settings › Modules: switching a module off never switches off another
 * without naming it (F13, DEC-067). The question in the row names every
 * module the API says goes off with it — and only modules the business can
 * see (DEC-057). Read-only: it asks, then answers "Keep it on".
 */

/** The rail's names for the two modules the API calls otherwise. */
const RAIL: Partial<Record<string, string>> = {
    CRM: "Contacts",
    COMMERCE: "Sell",
};

interface ModuleView {
    key: string;
    label: string;
    lifecycle: string;
}

async function signIn(page: Page) {
    await page.goto(`${urls.ACCOUNTS_URL}/login`);
    await page.getByLabel("Email").fill(demoUser.email);
    await page.getByLabel("Password", { exact: true }).fill(demoUser.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
    });
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

async function api<T>(page: Page, path: string): Promise<T> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${NORTHWIND_ORG}${path}`,
        {
            headers: {
                "x-organization-id": NORTHWIND_ORG,
                origin: urls.APP_URL,
            },
        },
    );
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { data: T }).data;
}

test("turning a module off names every module that goes with it, and Keep it on changes nothing", async ({
    page,
}) => {
    await signIn(page);
    const modules = await api<ModuleView[]>(page, "/modules");
    const nameOf = (key: string) =>
        RAIL[key] ?? modules.find((m) => m.key === key)?.label ?? key;

    // A module that is on and that others on need.
    let pick: { key: string; goesWith: string[] } | null = null;
    for (const m of modules.filter((x) => x.lifecycle === "ENABLED")) {
        const impact = await api<{ goesWith: string[]; blockers: unknown[] }>(
            page,
            `/modules/${m.key}/impact`,
        );
        if (impact.goesWith.length > 0 && impact.blockers.length === 0) {
            pick = { key: m.key, goesWith: impact.goesWith };
            break;
        }
    }
    test.skip(!pick, "No module on Northwind has another on that needs it.");
    if (!pick) return;

    await page.goto("/settings/modules");
    const key = pick.key;
    const name = nameOf(key);
    await page.getByRole("switch", { name }).click();
    const ask = page
        .getByRole("alert")
        .filter({ hasText: `Turn off ${name}?` });
    await expect(ask).toBeVisible();
    for (const key of pick.goesWith) {
        await expect(ask).toContainText(nameOf(key));
    }
    await expect(ask).toContainText(/turns? off with it/);
    await expect(ask).toContainText("Nothing is deleted.");

    const keep = ask.getByRole("button", { name: "Keep it on" });
    await expect(keep).toBeFocused();
    await expect(keep).toHaveCSS("cursor", "pointer");
    await keep.click();
    await expect(ask).toHaveCount(0);
    const after = await api<ModuleView[]>(page, "/modules");
    expect(after.find((m) => m.key === key)?.lifecycle).toBe("ENABLED");
});
