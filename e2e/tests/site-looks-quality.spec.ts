// @covers site:/ site:/book site:/shop api:sites pkg:site-blocks
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { overrideNorthwindFlag, setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";

/**
 * The quality gates for the looks (DEC-172, plan U17, #1110), before
 * rollout. For Folio, Quiet and Live, on Northwind's live home, booking
 * page and shop, desk and phone (the `desk-serial` and `phone-serial`
 * projects; the phone at 390×844):
 *
 * - axe (WCAG 2.0 and 2.1, A and AA) finds no serious or critical issue.
 * - THE ONE-BUTTON RULE: the first view holds exactly one visible button
 *   filled in the site's accent, and every view below it at most one. The
 *   booking page is measured with a service chosen: before that its
 *   button is quiet by design (`site-booking-looks.spec.ts`).
 * - A phone shows at most one fixed bar, at the top and at the foot.
 * - Every control and standalone link is 44×44 or more on a phone. A link
 *   inside running text is exempt (WCAG 2.5.8's inline exception). On a
 *   desk the blocks size their targets for a coarse pointer
 *   (`coarse:min-h-11`), so a small one there is reported, not failed.
 * - Under a 4G profile (Lighthouse's mobile throttling: 150 ms, 1.6 Mbps
 *   down, 750 Kbps up) the load shifts the layout by 0.1 or less (CLS, a
 *   hard gate). LCP over 2.5 s is reported as a warning only: it varies
 *   run to run on a shared machine.
 * - The page asks for at most two font families (the look's display and
 *   body faces; the ₹ face is built from the device's own and loads none).
 * - The document says `lang="en-IN"` (WV2Tech).
 *
 * What it owns: `SITE_LOOKS` and `SITE_SHOP` turned on for Northwind alone
 * (per-business overrides) and Northwind's site style, published; all put
 * back in `finally`. It writes nothing else.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;
type LookId = (typeof LOOKS)[number];

/** Northwind's seeded one-to-one service, chosen on the booking page. */
const WALKTHROUGH = "Warehouse walkthrough";

const CLS_BUDGET = 0.1;
const LCP_BUDGET_MS = 2_500;
const TARGET_PX = 44;

/** Lighthouse's mobile "Slow 4G", in the units CDP takes. */
const FOUR_G = {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
};

interface Vitals {
    cls: number;
    lcp: number;
}

const PAGES = [
    {
        name: "home",
        path: "/",
        ready: (look: LookId) => `[data-site-look-hero="${look}"]`,
    },
    {
        name: "book",
        path: "/book?step=what",
        ready: (look: LookId) => `[data-booking-look="${look}"]`,
    },
    {
        name: "shop",
        path: "/shop",
        ready: (look: LookId) => `[data-site-look="${look}"] main`,
    },
] as const;

/** A fresh address for the published page, past any cache in between. */
const fresh = (path: string) =>
    `${SITE}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

/**
 * Before any script of the page: CLS by session windows (gaps under 1 s,
 * windows of 5 s at most, input-led shifts left out) and the last LCP.
 */
function watchVitals(): void {
    const w = window as unknown as { __vitals: Vitals };
    w.__vitals = { cls: 0, lcp: 0 };
    let windowValue = 0;
    let first = 0;
    let last = 0;
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const shift = entry as PerformanceEntry & {
                    value: number;
                    hadRecentInput: boolean;
                };
                if (shift.hadRecentInput) continue;
                if (
                    windowValue > 0 &&
                    shift.startTime - last < 1_000 &&
                    shift.startTime - first < 5_000
                ) {
                    windowValue += shift.value;
                    last = shift.startTime;
                } else {
                    windowValue = shift.value;
                    first = shift.startTime;
                    last = shift.startTime;
                }
                w.__vitals.cls = Math.max(w.__vitals.cls, windowValue);
            }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const latest = entries.at(-1);
            if (latest) w.__vitals.lcp = latest.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
        // A browser without these entry types reports zeros.
    }
}

/**
 * The vitals once the load has settled: the network quiet and the fonts in
 * (a condition, never a fixed wait). Shifts after that, as the visitor
 * scrolls, are counted only up to here.
 */
async function vitals(page: Page): Promise<Vitals> {
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.evaluate(
        () => (window as unknown as { __vitals: Vitals }).__vitals,
    );
}

/** Serious and critical axe violations, one line per node. */
async function axeProblems(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // Next's dev overlay, which a production build does not draw.
        .exclude("nextjs-portal")
        .analyze();
    return results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .flatMap((v) =>
            v.nodes.map(
                (node) =>
                    `${v.id} (${v.impact ?? ""}): ${node.target.join(" ")} ${node.html.slice(0, 160)}`,
            ),
        );
}

/** The visible buttons in the current view filled in the site's accent. */
function filledInView(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.background = "hsl(var(--site-accent))";
        document.body.append(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                "a[href], button, [role='button']",
            ),
        )
            .filter((el) => {
                if (el.closest("nextjs-portal, [aria-hidden='true']"))
                    return false;
                const box = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return (
                    box.width > 1 &&
                    box.height > 1 &&
                    box.bottom > 0 &&
                    box.top < window.innerHeight &&
                    style.visibility !== "hidden" &&
                    style.backgroundColor === accent
                );
            })
            .map((el) => el.textContent.trim() || el.tagName);
    });
}

/** Fixed bands 40px or taller on screen; a dialog over the page is not one. */
function fixedBars(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
            .filter((el) => {
                if (el.closest("nextjs-portal, [role='dialog']")) return false;
                if (el.matches("[data-booking-frame='panel']")) return false;
                const style = getComputedStyle(el);
                if (style.position !== "fixed") return false;
                if (style.display === "none" || style.visibility === "hidden")
                    return false;
                if (el.getAttribute("aria-hidden") === "true") return false;
                const box = el.getBoundingClientRect();
                return (
                    box.height >= 40 &&
                    box.height < window.innerHeight - 1 &&
                    box.width > 0 &&
                    box.bottom > 0 &&
                    box.top < window.innerHeight
                );
            })
            .map(
                (el) =>
                    el.getAttribute("data-booking-bar") ??
                    el.getAttribute("data-site-chrome-bar") ??
                    el.getAttribute("data-site-consent") ??
                    el.tagName,
            ),
    );
}

/**
 * Controls and standalone links smaller than `min`, as "name WxH". A link
 * whose paragraph, list item or quote has words of its own beside it sits
 * in running text and is exempt; so is a visually hidden one (a skip link
 * until focused) and a checkbox or radio inside a label of the size.
 */
function smallTargets(page: Page, min: number): Promise<string[]> {
    return page.evaluate((least) => {
        const tooSmall = (box: DOMRect) =>
            box.width < least - 0.5 || box.height < least - 0.5;
        const inRunningText = (el: HTMLElement) => {
            const block = el.closest("p, li, dd, blockquote, figcaption, td");
            if (!block) return false;
            const own = el.textContent.trim().length;
            return block.textContent.trim().length > own;
        };
        return Array.from(
            document.querySelectorAll<HTMLElement>(
                [
                    "a[href]",
                    "button",
                    "summary",
                    "select",
                    "[role='button']",
                    "[role='radio']",
                    "[role='tab']",
                    "[role='checkbox']",
                    "[role='switch']",
                    "input:not([type='hidden'])",
                ].join(", "),
            ),
        )
            .filter((el) => {
                if (el.closest("nextjs-portal, [aria-hidden='true'], [inert]"))
                    return false;
                const style = getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden")
                    return false;
                const box = el.getBoundingClientRect();
                if (box.width <= 1 || box.height <= 1) return false;
                if (!tooSmall(box)) return false;
                if (el.matches("a[href]") && inRunningText(el)) return false;
                if (el.matches("input[type='checkbox'], input[type='radio']")) {
                    const label = el.closest("label");
                    if (label && !tooSmall(label.getBoundingClientRect()))
                        return false;
                }
                return true;
            })
            .map((el) => {
                const box = el.getBoundingClientRect();
                const name =
                    el.getAttribute("aria-label") ??
                    (el.textContent.trim() || el.tagName);
                return `${name.slice(0, 40)} ${Math.round(box.width)}x${Math.round(box.height)}`;
            });
    }, min);
}

/** The font families the page has asked for, less metric fallbacks. */
async function requestedFamilies(page: Page): Promise<string[]> {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const families = await page.evaluate(() =>
        [...document.fonts]
            .filter((f) => f.status === "loaded" || f.status === "loading")
            .map((f) => f.family.replace(/^["']|["']$/g, "")),
    );
    return [
        ...new Set(
            families
                .filter((f) => !/Fallback/i.test(f) && f !== "Site Rupee")
                // A face is two families, `jost` and its latin-ext `jostExt`
                // (`site-fonts.ts`); a hashed `__Jost_d4c3f2` is one too.
                .map((f) =>
                    f
                        .replace(/^__/, "")
                        .replace(/_[0-9a-f]{4,}$/i, "")
                        .replace(/Ext$/, ""),
                ),
        ),
    ];
}

/**
 * The one-button rule down the whole page: exactly one in the first view,
 * at most one in every view below, and at most one fixed bar on a phone.
 */
async function viewByView(page: Page, phone: boolean, where: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    // Polled: a button that a choice just let go eases into the accent
    // (150ms), and one read can land between the two colours.
    await expect
        .poll(() => filledInView(page), { message: `${where}: the first view` })
        .toHaveLength(1);
    if (phone)
        expect(
            (await fixedBars(page)).length,
            `${where}: fixed bars at the top`,
        ).toBeLessThanOrEqual(1);
    const { height, total } = await page.evaluate(() => ({
        height: window.innerHeight,
        total: document.documentElement.scrollHeight,
    }));
    for (let y = height; y < total; y += height) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        // The chrome looks again after a scroll (its Book bar shows or goes).
        await expect(page.locator("html")).toHaveAttribute(
            "data-site-primary",
            /^(shown|gone)$/,
        );
        expect(
            (await filledInView(page)).length,
            `${where}: the view at ${y}px`,
        ).toBeLessThanOrEqual(1);
        if (phone)
            expect(
                (await fixedBars(page)).length,
                `${where}: fixed bars at ${y}px`,
            ).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe("the looks' quality gates", { tag: "@serial" }, () => {
    for (const id of LOOKS) {
        test(`${id}: home, booking and shop hold axe, one button, one bar, 44px, CLS, two families and en-IN`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(420_000);
            const phone = testInfo.project.name.startsWith("phone");
            await page.setViewportSize(
                phone
                    ? { width: 390, height: 844 }
                    : { width: 1440, height: 900 },
            );
            await page.addInitScript(watchVitals);
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Network.enable");

            const shop = await overrideNorthwindFlag(
                browser,
                "SITE_SHOP",
                testInfo,
            );
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                for (const p of PAGES) {
                    const where = `${id} ${p.name} (${phone ? "phone" : "desk"})`;

                    // The load, under 4G.
                    await cdp.send("Network.emulateNetworkConditions", FOUR_G);
                    await page.goto(fresh(p.path));
                    await expect(page.locator(p.ready(id)).first()).toBeVisible(
                        { timeout: 60_000 },
                    );
                    const { cls, lcp } = await vitals(page);
                    await cdp.send("Network.emulateNetworkConditions", {
                        ...FOUR_G,
                        latency: 0,
                        downloadThroughput: -1,
                        uploadThroughput: -1,
                    });
                    expect(cls, `${where}: CLS under 4G`).toBeLessThanOrEqual(
                        CLS_BUDGET,
                    );
                    if (lcp > LCP_BUDGET_MS)
                        testInfo.annotations.push({
                            type: "warning",
                            description: `${where}: LCP ${Math.round(lcp)}ms under 4G, over the ${LCP_BUDGET_MS}ms budget`,
                        });

                    // The document.
                    await expect(page.locator("html")).toHaveAttribute(
                        "lang",
                        "en-IN",
                    );
                    await expect(
                        page.locator(`[data-site-look="${id}"]`),
                    ).toHaveCount(1);
                    const families = await requestedFamilies(page);
                    expect(
                        families.length,
                        `${where}: ${families.join(", ")}`,
                    ).toBeLessThanOrEqual(2);

                    // axe, on the page as a visitor first meets it.
                    expect(await axeProblems(page), where).toEqual([]);

                    // The booking page's button is quiet until a choice.
                    if (p.name === "book")
                        await page
                            .getByRole("radio", {
                                name: new RegExp(WALKTHROUGH),
                            })
                            .filter({ visible: true })
                            .first()
                            .click();

                    await viewByView(page, phone, where);

                    const small = await smallTargets(page, TARGET_PX);
                    if (phone)
                        expect(small, `${where}: 44px targets`).toEqual([]);
                    else if (small.length > 0)
                        testInfo.annotations.push({
                            type: "warning",
                            description: `${where}: under 44px for a mouse (coarse pointers get 44): ${small.join("; ")}`,
                        });
                }
            } finally {
                await cdp.detach().catch(() => undefined);
                await look.restore();
                await shop.restore();
            }
        });
    }
});
