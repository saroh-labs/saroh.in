// @covers accounts:/login app:/open app:/class-packs app:/class-packs/new api:class-packs
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { demoUser, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * The Pack Editor (round-2 E18) on Northwind, where browser checks may
 * write: a new pack autosaves as a draft, validity under 7 days is marked
 * and keeps Publish off, and Publish puts it on sale in Packs. The pack it
 * makes is archived at the end (a published pack can't be deleted), so the
 * demo business keeps no new pack on sale.
 *
 * Skipped when Northwind doesn't have Class packs switched on, or takes no
 * classes for a pack to pay for.
 */

const packApi = (path: string) =>
    `${urls.API_URL}/organizations/${NORTHWIND_ORG}/class-packs${path}`;

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

test.describe("the Pack Editor on Northwind (E18)", () => {
    test("create → autosaves as a draft → Publish → on sale in Packs", async ({
        page,
    }) => {
        await signIn(page);
        await page.goto("/class-packs/new");
        const heading = page.getByRole("heading", {
            level: 1,
            name: "New pack",
        });
        const opened = await heading
            .waitFor({ timeout: 10_000 })
            .then(() => true)
            .catch(() => false);
        test.skip(!opened, "Class packs aren't on for Northwind");
        const goodFor = page.getByRole("group", { name: "Good for" });
        test.skip(
            !(await goodFor.isVisible()),
            "Northwind has no classes for a pack to pay for",
        );

        await expect(
            page.getByText("Not saved yet — start with a name"),
        ).toBeVisible();
        const name = `E2E pack ${Date.now()}`;
        await page.getByLabel("Name").fill(name);
        // The first autosave makes it a draft at its own address.
        await page.waitForURL(/\/class-packs\/[^/]+\/edit$/);
        const id = new URL(page.url()).pathname.split("/").at(-2) ?? "";
        try {
            await expect(page.getByText(/Saved as a draft/)).toBeVisible();
            const publish = page.getByRole("button", {
                name: "Publish",
                exact: true,
            });
            await expect(publish).toBeDisabled();

            // Validity under 7: an inline error, and Publish stays off.
            await page.getByRole("radio", { name: "Other…" }).click();
            await page.getByLabel("Number of days").fill("5");
            await expect(
                page.getByText("Give at least 7 days to use it"),
            ).toBeVisible();
            await page.getByRole("radio", { name: "30 days" }).click();

            await page.getByRole("textbox", { name: /^Price/ }).fill("4500");
            await expect(page.getByText(/Draft · saved/)).toBeVisible();
            await expect(publish).toBeEnabled();
            await publish.click();
            await expect(
                page.getByText(`${name} is published — you can sell it now.`),
            ).toBeVisible();
            await expect(page.getByText("On sale · no changes")).toBeVisible();

            await page.goto("/class-packs");
            await expect(page.getByText(name)).toBeVisible();
        } finally {
            // Published: archive it. Still a draft: delete it.
            const read = await page.request.get(packApi(`/${id}/draft`), {
                headers: { "x-organization-id": NORTHWIND_ORG },
            });
            if (read.ok()) {
                const pack = (await read.json()) as {
                    status: string;
                    revision: number;
                };
                await (pack.status === "DRAFT"
                    ? page.request.delete(
                          packApi(`/${id}?revision=${pack.revision}`),
                          { headers: { "x-organization-id": NORTHWIND_ORG } },
                      )
                    : page.request.post(packApi(`/${id}/archive`), {
                          headers: { "x-organization-id": NORTHWIND_ORG },
                      }));
            }
        }
    });
});
