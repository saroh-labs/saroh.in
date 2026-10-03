// @covers web:/ web:/features web:/solutions web:/waitlist web:/api/waitlist api:waitlist
import { createRequire } from "node:module";

import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { urls } from "../playwright.config";

/**
 * The marketing site, saroh.in, across every page (plan U29): what no one
 * page's own check sees.
 *
 * - Every page loads with no console error, and does not scroll sideways
 *   at 390 or 320 wide.
 * - axe (WCAG 2.0–2.2 A and AA, and its best practices) finds no
 *   violation, of any impact, on any page, nor in
 *   an open nav menu or the phone's menu sheet.
 * - The nav menus open and close by keyboard, desk and phone.
 * - The waitlist form refuses what it should and takes a join through to
 *   the API (its own address, stamped, so it runs beside everything else).
 * - Pricing isn't published (Gate W): no page links to `/pricing`, names
 *   "Compare every plan" or draws a plan card, and `/pricing` itself is a
 *   temporary redirect to the waitlist.
 * - Every internal link on every page answers 200, or one 301 to a 200;
 *   every redirect in `apps/saroh.in/redirects.js` lands in one hop; the
 *   sitemap lists exactly the indexable pages and robots.txt keeps out
 *   the API.
 *
 * Read-only but for the waitlist join. The site runs on the seeded stack
 * at `E2E_WEB_URL` (3002 in CI and `pnpm prepush --e2e`), portless's
 * `https://saroh.localhost` otherwise.
 */

const WEB = urls.WEB_URL;

const FEATURES = [
    "dashboard",
    "products",
    "orders",
    "customers",
    "bookings",
    "subscriptions",
    "billing",
    "insights",
];
const SOLUTIONS = ["shops", "gyms", "clinics"];

/** The pages a search engine should find, in the launch mode the stack runs (waitlist). */
const INDEXED = [
    "/",
    ...FEATURES.map((s) => `/features/${s}`),
    ...SOLUTIONS.map((s) => `/solutions/${s}`),
    "/waitlist",
];

/** Every page a visitor can land on. */
const PAGES = INDEXED;

/** Kept out of search: robots.txt disallows each. */
const NOT_INDEXED = ["/api/"];

interface Redirect {
    source: string;
    destination: string;
    statusCode: number;
}
// The site's own list, so a redirect added there is checked here too.
const { REDIRECTS, TEMPORARY } = createRequire(__filename)(
    "../../apps/saroh.in/redirects.js",
) as { REDIRECTS: Redirect[]; TEMPORARY: Redirect[] };

/** WCAG 2.0–2.2 A and AA, and axe's best practices (heading order, unique landmarks). */
const AXE_TAGS = [
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
    "best-practice",
];

const isDesk = (testInfo: TestInfo) => testInfo.project.name.startsWith("desk");

/** Opens a page and collects what the browser reports as an error. */
async function openCollecting(page: Page, path: string) {
    const errors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("response", (r) => {
        if (r.url().startsWith(WEB) && r.status() >= 400)
            errors.push(`${r.status()} ${r.url()}`);
    });
    const res = await page.goto(`${WEB}${path}`, { waitUntil: "load" });
    expect(res?.status(), `${path} answers 200`).toBe(200);
    await expect(page.locator("main, [role=main]").first()).toBeVisible();
    return errors;
}

function axeReport(
    violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
    return violations.map(
        (v) =>
            `${v.impact ?? "?"} ${v.id}: ${v.help} — ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(" "))
                .join(" | ")}`,
    );
}

/** One request, no redirects followed. */
function head(request: APIRequestContext, url: string) {
    return request.get(url, { maxRedirects: 0 });
}

/** A link resolves: 200, or a single 301/308 whose target answers 200. */
async function resolves(request: APIRequestContext, url: string) {
    const first = await head(request, url);
    if (first.status() === 200) return "200";
    if (![301, 308].includes(first.status()))
        return `${first.status()} (not 200 or one redirect)`;
    const to = new URL(first.headers().location, url).toString();
    const second = await head(request, to);
    return second.status() === 200
        ? "200"
        : `${first.status()} → ${to} answered ${second.status()}`;
}

test.describe("every page", () => {
    for (const path of PAGES) {
        test(`${path} loads clean and passes axe`, async ({ page }) => {
            const errors = await openCollecting(page, path);
            const axe = await new AxeBuilder({ page })
                .withTags(AXE_TAGS)
                .analyze();
            expect(axeReport(axe.violations), `axe on ${path}`).toEqual([]);
            expect(errors, `errors on ${path}`).toEqual([]);
        });

        test(`${path} does not scroll sideways at 390 or 320`, async ({
            page,
        }) => {
            for (const width of [390, 320]) {
                await page.setViewportSize({ width, height: 844 });
                await page.goto(`${WEB}${path}`, { waitUntil: "load" });
                // Against the width we set: a phone viewport widens
                // innerWidth to fit an overflow rather than scrolling.
                await expect
                    .poll(
                        () =>
                            page.evaluate(() => ({
                                inner: window.innerWidth,
                                scroll: document.documentElement.scrollWidth,
                            })),
                        { message: `${path} at ${width}` },
                    )
                    .toEqual({ inner: width, scroll: width });
            }
        });
    }
});

test.describe("nav menus by keyboard", () => {
    test("desk: Features and Solutions open, move and close", async ({
        page,
    }, testInfo) => {
        test.skip(!isDesk(testInfo), "the menus are the wide nav's");
        await page.goto(`${WEB}/`);
        const nav = page.getByRole("navigation", { name: "Main" });

        for (const [label, count] of [
            ["Features", FEATURES.length],
            ["Solutions", SOLUTIONS.length],
        ] as const) {
            const button = nav.getByRole("button", { name: label });
            await button.focus();
            await page.keyboard.press("Enter");
            await expect(button).toHaveAttribute("aria-expanded", "true");
            const menu = nav.getByRole("menu", { name: label });
            const items = menu.getByRole("menuitem");
            await expect(items).toHaveCount(count);
            // Opening puts focus on the first item; the arrows move and wrap.
            await expect(items.first()).toBeFocused();
            await page.keyboard.press("ArrowDown");
            await expect(items.nth(1)).toBeFocused();
            await page.keyboard.press("ArrowUp");
            await page.keyboard.press("ArrowUp");
            await expect(items.last()).toBeFocused();

            const axe = await new AxeBuilder({ page })
                .include(`#nav-menu-${label.toLowerCase()}`)
                .withTags(AXE_TAGS)
                .analyze();
            expect(axeReport(axe.violations), `axe, ${label} menu`).toEqual([]);

            await page.keyboard.press("Escape");
            await expect(menu).toBeHidden();
            await expect(button).toHaveAttribute("aria-expanded", "false");
            await expect(button).toBeFocused();
        }

        // Enter on an item goes there, and the menu is closed on arrival.
        await nav.getByRole("button", { name: "Solutions" }).focus();
        await page.keyboard.press("Enter");
        await expect(
            nav
                .getByRole("menu", { name: "Solutions" })
                .getByRole("menuitem")
                .first(),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(`${WEB}/solutions/${SOLUTIONS[0]}`);
        await expect(nav.getByRole("menu")).toHaveCount(0);
    });

    test("phone: the menu sheet opens, traps focus and closes", async ({
        page,
    }, testInfo) => {
        test.skip(isDesk(testInfo), "the sheet is the narrow nav's");
        await page.goto(`${WEB}/`);
        const menuButton = page.getByRole("button", {
            name: "Menu",
            exact: true,
        });
        await menuButton.focus();
        await page.keyboard.press("Enter");
        const sheet = page.getByRole("dialog", { name: "Menu" });
        await expect(sheet).toBeVisible();
        await expect(menuButton).toHaveAttribute("aria-expanded", "true");
        // Focus is inside the sheet and stays there.
        await expect
            .poll(() =>
                sheet.evaluate((el) => el.contains(document.activeElement)),
            )
            .toBe(true);

        // Each section opens and closes from the keyboard.
        for (const [label, count] of [
            ["Features", FEATURES.length],
            ["Solutions", SOLUTIONS.length],
        ] as const) {
            const row = sheet.getByRole("button", { name: label });
            await row.focus();
            await page.keyboard.press("Enter");
            await expect(row).toHaveAttribute("aria-expanded", "true");
            await expect(
                sheet.locator(`#nav-sheet-${label.toLowerCase()} a`),
            ).toHaveCount(count);
        }

        const axe = await new AxeBuilder({ page })
            .include("#nav-sheet")
            .withTags(AXE_TAGS)
            .analyze();
        expect(axeReport(axe.violations), "axe, menu sheet").toEqual([]);

        for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
        expect(
            await sheet.evaluate((el) => el.contains(document.activeElement)),
            "Tab stays inside the sheet",
        ).toBe(true);

        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(menuButton).toBeFocused();

        // × closes it too.
        await menuButton.click();
        await sheet.getByRole("button", { name: "Close menu" }).click();
        await expect(sheet).toBeHidden();
    });
});

test.describe("waitlist", () => {
    test("refuses what it should, then takes a join to the API", async ({
        page,
    }, testInfo) => {
        await page.goto(`${WEB}/waitlist?src=e2e`);
        const form = page.locator("form", {
            has: page.getByRole("heading", { name: "Join the waitlist" }),
        });
        const submit = form.getByRole("button", { name: "Join the waitlist" });

        // Empty: the design's three messages; city is optional.
        await submit.click();
        await expect(form.getByText("Add your business name.")).toBeVisible();
        await expect(form.getByText("Pick the closest one.")).toBeVisible();
        await expect(
            form.getByText("Enter an email like name@shop.in."),
        ).toBeVisible();
        const business = form.getByRole("textbox", { name: "Business name" });
        await expect(business).toBeFocused();
        await expect(business).toHaveAttribute("aria-invalid", "true");

        const name = `U29 ${stamp(testInfo)}`;
        await business.fill(name);
        await expect(form.getByText("Add your business name.")).toBeHidden();
        const kind = form.locator("fieldset").getByRole("button").first();
        await kind.click();
        await expect(kind).toHaveAttribute("aria-pressed", "true");
        await expect(form.getByText("Pick the closest one.")).toBeHidden();

        // A malformed address is refused before anything is sent.
        const email = form.getByRole("textbox", { name: "Email" });
        await email.fill("not-an-email");
        await submit.click();
        await expect(
            form.getByText("Enter an email like name@shop.in."),
        ).toBeVisible();
        await expect(email).toHaveAttribute("aria-invalid", "true");

        const address = `${stamp(testInfo).toLowerCase()}@example.com`;
        await email.fill(address);
        const joined = page.waitForResponse(
            (r) =>
                r.url().endsWith("/api/waitlist") &&
                r.request().method() === "POST",
        );
        await submit.click();
        const res = await joined;
        expect(res.status(), "the API took the join").toBe(200);

        // The done state, focused on its heading: a new entry has its place.
        await expect(page.getByText("YOU'RE IN")).toBeVisible();
        const heading = page.getByRole("heading", { name: name });
        await expect(heading).toBeFocused();
        await expect(heading).toHaveText(
            new RegExp(`^${name} is #\\d+ on the list\\.$`),
        );
        await expect(page.getByText(address)).toBeVisible();

        const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(axeReport(axe.violations), "axe, done state").toEqual([]);

        // "Add another business" brings the empty form back.
        await page
            .getByRole("button", { name: "Add another business" })
            .click();
        await expect(
            page.getByRole("textbox", { name: "Business name" }),
        ).toHaveValue("");
    });
});

test.describe("no pricing yet", () => {
    test("no page links to /pricing or shows a plan", async ({ page }) => {
        for (const path of PAGES) {
            await page.goto(`${WEB}${path}`);
            await expect(
                page.locator(
                    'a[href^="/pricing"], a[href*="saroh.in/pricing"]',
                ),
                `${path} links to /pricing`,
            ).toHaveCount(0);
            await expect(
                page.locator("[data-plan]"),
                `${path} draws a plan card`,
            ).toHaveCount(0);
            await expect(page.locator("#pricing")).toHaveCount(0);
            await expect(page.getByText("Compare every plan")).toHaveCount(0);
        }
    });

    test("/pricing is a temporary redirect to the waitlist", async ({
        request,
    }, testInfo) => {
        test.skip(!isDesk(testInfo), "HTTP only; once is enough");
        const res = await head(request, `${WEB}/pricing`);
        expect(res.status()).toBe(302);
        expect(new URL(res.headers().location, WEB).pathname).toBe("/waitlist");
    });
});

test.describe("links, redirects and the sitemap", () => {
    test("every internal link on every page resolves", async ({
        page,
        request,
    }) => {
        const found = new Map<string, string>(); // url -> first page it was on
        for (const path of PAGES) {
            await page.goto(`${WEB}${path}`);
            const hrefs = await page
                .locator("a[href]")
                .evaluateAll((as) =>
                    as.map((a) => (a as HTMLAnchorElement).href),
                );
            for (const href of hrefs) {
                const u = new URL(href);
                if (u.origin !== new URL(WEB).origin) continue;
                u.hash = "";
                if (!found.has(u.toString())) found.set(u.toString(), path);
            }
        }
        expect(found.size).toBeGreaterThan(PAGES.length);
        const broken: string[] = [];
        for (const [url, on] of found) {
            const r = await resolves(request, url);
            if (r !== "200") broken.push(`${url} (on ${on}): ${r}`);
        }
        expect(broken).toEqual([]);
    });

    test("every redirect in redirects.js lands in one hop", async ({
        request,
    }, testInfo) => {
        test.skip(!isDesk(testInfo), "HTTP only; once is enough");
        expect(REDIRECTS.length).toBeGreaterThan(0);
        for (const r of [...REDIRECTS, ...TEMPORARY]) {
            // A pattern gets a made-up value: it is the catch-all for slugs
            // that no longer exist.
            const source = r.source.replace(/:(\w+)/g, "no-such-$1");
            const first = await head(request, `${WEB}${source}`);
            expect(first.status(), `${source}`).toBe(r.statusCode);
            const to = new URL(first.headers().location, WEB);
            expect(to.pathname, `${source} goes to`).toBe(r.destination);
            const landed = await head(request, to.toString());
            expect(landed.status(), `${source} → ${to.pathname}`).toBe(200);
        }
    });

    test("the sitemap lists exactly the indexable pages; robots keeps out the rest", async ({
        request,
    }, testInfo) => {
        test.skip(!isDesk(testInfo), "HTTP only; once is enough");
        const sitemap = await request.get(`${WEB}/sitemap.xml`);
        expect(sitemap.status()).toBe(200);
        const listed = [
            ...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
        ]
            .map((m) => new URL(m[1]).pathname)
            .sort();
        expect(listed).toEqual([...INDEXED].sort());
        for (const path of listed) {
            expect((await head(request, `${WEB}${path}`)).status(), path).toBe(
                200,
            );
        }

        const robots = await (await request.get(`${WEB}/robots.txt`)).text();
        for (const path of NOT_INDEXED)
            expect(robots, `robots.txt disallows ${path}`).toContain(
                `Disallow: ${path}`,
            );
        expect(robots).toMatch(/Sitemap: \S+\/sitemap\.xml/);
    });

    test("the waitlist route refuses a join with no email", async ({
        request,
    }, testInfo) => {
        test.skip(!isDesk(testInfo), "HTTP only; once is enough");
        // A join with no email never reaches the API.
        const bad = await request.post(`${WEB}/api/waitlist`, {
            data: { business: "No address" },
        });
        expect(bad.status()).toBe(400);
    });
});
