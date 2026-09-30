// @covers accounts:/login app:/open app:/settings/modules app:/services app:/analytics app:/class-packs api:capabilities
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * The one "Turn on" sheet (DEC-068), desk and phone. Northwind has every
 * module on, so each test turns one off through the API, turns it back on
 * through the sheet from a real entry point, and checks it lands on the
 * module's first screen with it on. Whatever happens, the module is put
 * back as it was.
 *
 * @serial: a module is business-wide; every other test reads the rail and
 * the screens it opens.
 */

interface ModuleView {
    key: string;
    lifecycle: string;
}

async function lifecycleOf(request: APIRequestContext, key: string) {
    const modules = await northwind(request).get<{ data: ModuleView[] }>(
        "/modules",
    );
    return modules.data.find((m) => m.key === key)?.lifecycle ?? null;
}

async function setLifecycle(
    request: APIRequestContext,
    key: string,
    status: "ENABLED" | "DISABLED",
) {
    await northwind(request).put(`/modules/${key}`, { status });
}

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

/** The sheet, and on a phone that it rises from the bottom, full height. */
async function theSheet(page: Page, title: string): Promise<Locator> {
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet).toBeVisible();
    if (test.info().project.name.startsWith("phone")) {
        const box = await sheet.boundingBox();
        const height = page.viewportSize()?.height ?? 0;
        expect(box).not.toBeNull();
        expect(Math.round((box?.y ?? -1) + (box?.height ?? 0))).toBe(height);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(height - 1);
    }
    return sheet;
}

/** "Turn on", drawn once, with the pointer and a 44px target on a phone. */
async function turnOnButton(page: Page, sheet: Locator): Promise<Locator> {
    const button = sheet
        .getByRole("button", { name: "Turn on", exact: true })
        .filter({ visible: true });
    await expect(button).toHaveCount(1);
    await expect(button).toBeEnabled();
    await expect(button).toHaveCSS("cursor", "pointer");
    if (test.info().project.name.startsWith("phone")) {
        expect(
            await page.evaluate(
                () => window.matchMedia("(pointer: coarse)").matches,
            ),
        ).toBe(true);
        const box = await button.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    return button;
}

test.describe(
    "turning a module on asks for its minimum first",
    {
        tag: "@serial",
    },
    () => {
        test("Settings › Modules: Insights asks nothing, turns on and lands on its figures", async ({
            page,
        }) => {
            test.setTimeout(90_000);
            await signIn(page);
            const was = await lifecycleOf(page.request, "INSIGHTS");
            test.skip(was === null, "Northwind has no Insights module.");
            try {
                if (was === "ENABLED") {
                    await setLifecycle(page.request, "INSIGHTS", "DISABLED");
                }
                await page.goto("/settings/modules");
                await page
                    .getByRole("switch", { name: "Insights" })
                    .filter({ visible: true })
                    .click();

                const sheet = await theSheet(page, "Turn on Insights");
                await expect(sheet).toContainText(
                    "Figures across whatever else is turned on.",
                );
                await expect(sheet).toContainText("Nothing to fill in.");
                await (await turnOnButton(page, sheet)).click();

                await expect(page).toHaveURL(/\/analytics/);
                await expect(page.getByText("Insights is on.")).toBeVisible();
                expect(await lifecycleOf(page.request, "INSIGHTS")).toBe(
                    "ENABLED",
                );
            } finally {
                const now = await lifecycleOf(page.request, "INSIGHTS");
                if (was && now !== was) {
                    await setLifecycle(
                        page.request,
                        "INSIGHTS",
                        was === "ENABLED" ? "ENABLED" : "DISABLED",
                    );
                }
            }
        });

        test("Also sell: ticking Class packs opens the sheet, and Cancel turns nothing on", async ({
            page,
        }) => {
            test.setTimeout(90_000);
            await signIn(page);
            const bookings = await lifecycleOf(page.request, "APPOINTMENTS");
            const was = await lifecycleOf(page.request, "CLASS_PACKS");
            test.skip(
                bookings !== "ENABLED" || was === null,
                "Northwind isn't taking bookings, or has no Class packs.",
            );
            try {
                if (was === "ENABLED") {
                    await setLifecycle(page.request, "CLASS_PACKS", "DISABLED");
                }
                await page.goto("/services");
                const alsoSell = page
                    .getByRole("group", { name: "Also sell" })
                    .filter({ visible: true });
                await alsoSell
                    .getByRole("checkbox", { name: /Class packs/ })
                    .click();

                let sheet = await theSheet(page, "Turn on Class packs");
                // Bookings is on already: nothing comes with it.
                await expect(sheet).not.toContainText("What comes with it");
                await sheet
                    .getByRole("button", { name: "Cancel" })
                    .filter({ visible: true })
                    .click();
                await expect(sheet).toBeHidden();
                expect(await lifecycleOf(page.request, "CLASS_PACKS")).toBe(
                    "DISABLED",
                );

                await alsoSell
                    .getByRole("checkbox", { name: /Class packs/ })
                    .click();
                sheet = await theSheet(page, "Turn on Class packs");
                await (await turnOnButton(page, sheet)).click();
                await expect(page).toHaveURL(/\/class-packs/);
                await expect(
                    page.getByText(/Class packs is on\./),
                ).toBeVisible();
                expect(await lifecycleOf(page.request, "CLASS_PACKS")).toBe(
                    "ENABLED",
                );
            } finally {
                const now = await lifecycleOf(page.request, "CLASS_PACKS");
                if (was && now !== was) {
                    await setLifecycle(
                        page.request,
                        "CLASS_PACKS",
                        was === "ENABLED" ? "ENABLED" : "DISABLED",
                    );
                }
            }
        });
    },
);
