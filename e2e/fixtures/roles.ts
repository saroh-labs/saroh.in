import type {
    APIRequestContext,
    Browser,
    Locator,
    Page,
} from "@playwright/test";
import { expect } from "@playwright/test";

import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";
import type { Role } from "./sessions";
import { useSession } from "./sessions";

/**
 * What the role specs share (`tests/role-*.spec.ts`): the menu a role is
 * offered, read the same way at the desk and on a phone; the one denied
 * state; and "Leave {business}", opened and answered with Stay.
 *
 * Every role here is a seeded person on Northwind, so what one of them is
 * refused another's test can make first, as the owner, through the API.
 */

/** Northwind's name, as every sentence about it says it. */
export const NORTHWIND_NAME = "Northwind Supply";

/** Who can lift a denial by role: the line every denied screen ends on. */
export const WHO_CAN_CHANGE =
    "An owner or admin can change this in Settings › Team.";

/** The same, for what no role but the owner's reaches. */
export const ONLY_OWNER_CAN_CHANGE = "Only the owner can change this.";

/** What someone who can't change the plan reads where the link would be. */
export const WHO_CAN_CHANGE_PLAN =
    "The owner can change the plan in Settings › Plan and billing.";

export const onPhone = (page: Page) =>
    (page.viewportSize()?.width ?? 1440) < 760;

/** Sign in as a seeded person and open Northwind. */
export async function openNorthwindAs(page: Page, role: Role): Promise<void> {
    await useSession(page, role);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

/**
 * The owner's side, in a context of their own, so the page under test
 * stays the role's: the owner makes what the role is then shown.
 */
export async function asOwner(
    browser: Browser,
): Promise<{ request: APIRequestContext; close: () => Promise<void> }> {
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await useSession(page, "owner");
    return { request: page.request, close: () => context.close() };
}

/** A page of a section: Sell's Orders, Bookings' Services. */
export interface MenuPage {
    label: string;
    href: string;
    /**
     * Drawn only in a state the test doesn't own (Sell › Stock, while the
     * business tracks stock): allowed, never required.
     */
    optional?: boolean;
}

/** One row of the menu. With `pages`, it is a section. */
export interface MenuRow {
    label: string;
    /** Where the row itself goes: a section lands on its first page. */
    href: string;
    pages?: readonly MenuPage[];
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A row by its name. A row's accessible name carries on after its label
 * ("Orders 3 waiting", "Sell, current"), and "Location" reads "Locations"
 * for a business with several, so the label is where the name starts.
 */
const named = (label: string) => new RegExp(`^${escaped(label)}`);

const hrefsOf = (links: Locator) =>
    links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));

/**
 * The menu holds exactly `rows`, and each section exactly its pages: no
 * row is missing and none is there that the role can't open.
 *
 * At the desk it is the rail: every row on Home, and a section's pages
 * under it once you are in it (the rail opens the section you are in). On a
 * phone it is the bottom bar and the "More" sheet, which between them hold
 * every row once: a section's pages under its name, and the rows with no
 * seat on the bar under Workspace.
 */
export async function expectMenu(
    page: Page,
    rows: readonly MenuRow[],
): Promise<void> {
    if (onPhone(page)) await expectPhoneMenu(page, rows);
    else await expectRail(page, rows);
}

async function expectRail(page: Page, rows: readonly MenuRow[]) {
    const rail = page.getByRole("navigation", { name: "Primary" });
    const optional = new Set(
        rows.flatMap((r) =>
            (r.pages ?? []).filter((p) => p.optional).map((p) => p.href),
        ),
    );
    const drawn = async () =>
        (await hrefsOf(rail.getByRole("link"))).filter((h) => !optional.has(h));

    await page.goto("/");
    await expect.poll(drawn).toEqual(rows.map((r) => r.href));
    for (const row of rows) {
        await expect(
            rail.getByRole("link", { name: named(row.label) }).first(),
        ).toBeVisible();
    }

    for (const section of rows.filter((r) => r.pages)) {
        const pages = (section.pages ?? []).filter((p) => !p.optional);
        await page.goto(pages[0]?.href ?? section.href);
        await expect
            .poll(drawn)
            .toEqual(
                rows.flatMap((r) =>
                    r === section
                        ? [r.href, ...pages.map((p) => p.href)]
                        : [r.href],
                ),
            );
        for (const p of pages) {
            await expect(
                rail.getByRole("link", { name: named(p.label) }).last(),
            ).toBeVisible();
        }
    }
}

async function expectPhoneMenu(page: Page, rows: readonly MenuRow[]) {
    const bar = page.getByRole("navigation", { name: "Main" });
    const sections = rows.filter((r) => r.pages);
    const plain = rows.filter((r) => !r.pages).map((r) => r.href);
    // A section's seat opens its first page.
    const sectionSeats = sections.map((s) => s.pages?.[0]?.href ?? s.href);

    await page.goto("/");
    await expect(
        bar.getByRole("link", { name: named("Home") }).first(),
    ).toBeVisible();
    // The bar is drawn whole, so once Home is there every seat is. It holds
    // four at most, and nothing that isn't one of the role's rows.
    const offered = [...plain, ...sectionSeats];
    await expect
        .poll(async () =>
            (await hrefsOf(bar.getByRole("link"))).filter(
                (h) => !offered.includes(h),
            ),
        )
        .toEqual([]);
    const tabs = await hrefsOf(bar.getByRole("link"));
    expect(tabs.length).toBeLessThanOrEqual(4);
    const seatedPlain = tabs.filter((h) => plain.includes(h));
    const unseated = plain.filter((h) => !seatedPlain.includes(h));

    const more = bar.getByRole("button", { name: /^More/ });
    if (sections.length === 0 && unseated.length === 0) {
        // Everything fits on the bar, so there is no sheet to hold the rest.
        await expect(more).toHaveCount(0);
        return;
    }

    await more.click();
    const sheet = page.getByRole("dialog", { name: "Everything else" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("group")).toHaveCount(
        sections.length + (unseated.length > 0 ? 1 : 0),
    );
    for (const section of sections) {
        const pages = section.pages ?? [];
        const optional = new Set(
            pages.filter((p) => p.optional).map((p) => p.href),
        );
        const group = sheet.getByRole("group", {
            name: section.label,
            exact: true,
        });
        await expect
            .poll(async () =>
                (await hrefsOf(group.getByRole("link"))).filter(
                    (h) => !optional.has(h),
                ),
            )
            .toEqual(pages.filter((p) => !p.optional).map((p) => p.href));
        for (const p of pages.filter((x) => !x.optional)) {
            await expect(
                group.getByRole("link", { name: named(p.label) }),
            ).toBeVisible();
        }
    }
    const workspace = sheet.getByRole("group", {
        name: "Workspace",
        exact: true,
    });
    if (unseated.length > 0) {
        await expect
            .poll(() => hrefsOf(workspace.getByRole("link")))
            .toEqual(unseated);
    } else {
        await expect(workspace).toHaveCount(0);
    }
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
}

/** Settings' own tabs hold exactly these pages, in this order. */
export async function expectSettingsTabs(
    page: Page,
    hrefs: readonly string[],
): Promise<void> {
    await page.goto("/settings/profile");
    const tabs = page.getByRole("navigation", { name: "Settings" });
    await expect
        .poll(() => hrefsOf(tabs.getByRole("link")))
        .toEqual([...hrefs]);
}

/**
 * A deep link the role can't open says so in the one denied state: what
 * they can't open and who can change it. Never an error, a blank page, a
 * missing page or a trip somewhere else, and the menu stays.
 */
export async function expectDenied(
    page: Page,
    path: string,
    {
        thing,
        who = WHO_CAN_CHANGE,
    }: {
        /** The menu's name for it: "You can't open {thing}". */
        thing: string;
        who?: string;
    },
): Promise<void> {
    await page.goto(path);
    await expect(
        page.getByRole("heading", { name: `You can't open ${thing}` }),
    ).toBeVisible();
    await expect(page.getByText(who).first()).toBeVisible();
    await expect(
        page.getByText(new RegExp(`doesn't include ${escaped(thing)}\\.`)),
    ).toBeVisible();
    // It stayed where it was asked for: no redirect, and so no loop.
    expect(new URL(page.url()).pathname).toBe(path.split(/[?#]/)[0]);
    // A denial is not a failure: nothing to try again, and no page missing.
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
        0,
    );
    await expect(page.getByRole("link", { name: "Try again" })).toHaveCount(0);
    await expect(
        page.getByRole("heading", {
            name: /went wrong|not found|couldn't load/i,
        }),
    ).toHaveCount(0);
    // The way to everything else is still there.
    await expect(
        page.getByRole("navigation", {
            name: onPhone(page) ? "Main" : "Primary",
        }),
    ).toBeVisible();
}

/** Nothing on the page starts this: not as a button, not as a link. */
export async function expectNotOffered(
    page: Page,
    name: string | RegExp,
): Promise<void> {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
    await expect(page.getByRole("link", { name })).toHaveCount(0);
}

/**
 * Plan and billing is not this role's: Settings has no tab for it, its
 * address says who can change that, and nothing there offers "See plans".
 */
export async function expectNoWayToPlans(page: Page): Promise<void> {
    await page.goto("/settings/billing");
    await expect(
        page.getByRole("heading", {
            name: "You can't open Plan and billing",
        }),
    ).toBeVisible();
    await expect(page.getByText(WHO_CAN_CHANGE).first()).toBeVisible();
    await expect(
        page
            .getByRole("navigation", { name: "Settings" })
            .getByRole("link", { name: /^Plan and billing/ }),
    ).toHaveCount(0);
    await expectNotOffered(page, "See plans");
    await expect(page.getByRole("region", { name: "Change plan" })).toHaveCount(
        0,
    );
}

/**
 * "Leave {business}" is on Your profile for this person. The confirm says
 * what goes and offers "Stay" and "Leave business"; Stay is pressed, since
 * every spec shares these logins, and they are still in the business after.
 */
export async function expectLeaveOfferedThenStay(
    page: Page,
    {
        locations = [],
    }: {
        /** The locations they work at here, which the confirm names. */
        locations?: readonly string[];
    } = {},
): Promise<void> {
    const leave = `Leave ${NORTHWIND_NAME}`;
    await page.goto("/settings/profile");
    const section = page.getByRole("region", { name: leave });
    await section.getByRole("button", { name: leave }).click();

    const confirm = page.getByRole("alertdialog", { name: `${leave}?` });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(
        `You lose access to ${NORTHWIND_NAME} now`,
    );
    await expect(confirm).toContainText("This cannot be undone.");
    for (const location of locations) {
        await expect(confirm).toContainText(`You come off ${location} too.`);
    }
    await expect(
        confirm.getByRole("button", { name: "Leave business" }),
    ).toBeEnabled();
    await confirm.getByRole("button", { name: "Stay" }).click();
    await expect(confirm).toBeHidden();

    // Still here: the page is theirs, and the way out is still offered.
    await page.reload();
    await expect(section.getByRole("button", { name: leave })).toBeVisible();
}

/** A toast, of the two that can be mounted: the one that is shown. */
export const shown = (page: Page, text: string | RegExp) =>
    page.getByText(text).filter({ visible: true }).first();
