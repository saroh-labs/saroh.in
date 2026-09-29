// @covers app:/open app:/settings/modules app:/bookings app:/sites app:/courses app:/class-packs app:/contacts api:capabilities
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Settings › Modules, DEC-057 (P1): a module Saroh hasn't rolled out is
 * never shown, and no raw code (`ROLLOUT_DISABLED`, `CRM_NO_PIPELINE`…)
 * reaches the screen. The owner's session, read-only: nothing is switched.
 *
 * Northwind has every module rolled out, so it shows each one. Rye & Co.
 * has three (the seed's showcase), so it is where hidden modules are
 * checked — read only, as the film sets are.
 */

const RYE = "seed_sc_rc_org";

/** A code as the API spells one: capitals joined by underscores. */
const RAW_CODE = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/;

/** Settings › Modules' names for the modules the API calls otherwise. */
const SHOWN_AS: Partial<Record<string, string>> = {
    CRM: "Contacts",
    COMMERCE: "Sell",
};

/** Where each module's section lives, for the ones that have one. */
const ROUTE: Partial<Record<string, string>> = {
    APPOINTMENTS: "/bookings",
    WEBSITE: "/sites",
    COURSES: "/courses",
    CLASS_PACKS: "/class-packs",
    CRM: "/contacts",
};

interface ModuleView {
    key: string;
    label: string;
    lifecycle: string;
    blockers: { code: string }[];
}

async function modulesOf(page: Page, org: string): Promise<ModuleView[]> {
    const res = await page.request.get(
        `${urls.API_URL}/organizations/${org}/modules`,
        { headers: { "x-organization-id": org, origin: urls.APP_URL } },
    );
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { data: ModuleView[] }).data;
}

const dark = (m: ModuleView) =>
    m.blockers.some((b) => b.code === "ROLLOUT_DISABLED");

const nameOf = (m: ModuleView) => SHOWN_AS[m.key] ?? m.label;

/** The row's switch, by the module's name at the start of its label. */
const switchOf = (page: Page, name: string) =>
    page.getByRole("switch", { name: new RegExp(`^${name}(\\s*,|$)`) });

async function open(page: Page, org: string) {
    await useSession(page);
    await page.goto(`/open/${org}`);
    await page.goto("/settings/modules");
    await expect(page.getByRole("switch").first()).toBeVisible();
}

test("every module Saroh has rolled out has its switch, and no code is on the screen", async ({
    page,
}) => {
    await open(page, NORTHWIND_ORG);
    const modules = await modulesOf(page, NORTHWIND_ORG);
    for (const m of modules.filter((x) => !dark(x))) {
        await expect(switchOf(page, nameOf(m))).toHaveCount(1);
    }
    await expect(page.locator("#main-content")).not.toContainText(RAW_CODE);
});

test("a module Saroh hasn't rolled out is absent: no switch, no code, and its page isn't there", async ({
    page,
}) => {
    await open(page, RYE);
    const modules = await modulesOf(page, RYE);
    const hidden = modules.filter(dark);
    // The seed rolls out three modules to Rye; the rest are dark there.
    expect(hidden.length).toBeGreaterThan(0);

    for (const m of hidden) {
        await expect(switchOf(page, nameOf(m))).toHaveCount(0);
    }
    for (const m of modules.filter((x) => !dark(x))) {
        await expect(switchOf(page, nameOf(m))).toHaveCount(1);
    }
    const main = page.locator("#main-content");
    await expect(main).not.toContainText(RAW_CODE);
    await expect(main).not.toContainText("ROLLOUT");

    // A hidden module's section is no page — not "turned off" with a
    // button to a switch Settings doesn't show. The workspace stays round it.
    const gated = hidden.find((m) => ROUTE[m.key]);
    test.skip(!gated, "No hidden module on Rye has a section of its own.");
    if (!gated) return;
    await page.goto(ROUTE[gated.key] ?? "/");
    await expect(
        page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByText("is turned off")).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Your account" }),
    ).toBeVisible();
});
