// @covers accounts:/login app:/open app:/ app:/commerce/orders app:/commerce/customers app:/customers app:/calendar app:/bookings app:/commerce/products app:/billing/invoices app:/billing/subscriptions app:/settings/organization app:/settings/people app:/settings/modules app:/settings/billing app:/settings/profile app:/settings/activity api:home api:orders api:customer-workspace api:customers api:calendar api:bookings api:products api:invoices api:subscriptions api:organizations pkg:ui
import fs from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * The accessibility and microinteraction guard (pre-launch polish P3).
 *
 * The standing rule: every clickable element shows the pointer cursor and has
 * visible hover, focus and pressed states; keyboard focus is visible; every
 * control has an accessible name. The primitives in `packages/ui` carry it,
 * so every screen inherits it — and this spec is what notices when a screen
 * hand-rolls a control that does not.
 *
 * On each main screen, desk and phone:
 *
 * 1. axe (WCAG 2.0 and 2.1, A and AA) finds no serious or critical violation.
 * 2. Every visible, enabled button, link and role=button / radio / tab /
 *    menuitem / checkbox / switch / option computes `cursor: pointer`.
 * 3. Tabbing through the first FOCUS_STOPS stops — from the top of the page,
 *    and again from the start of its content — shows a focus indicator at
 *    every stop: an outline or box-shadow that was not there at rest.
 *
 * Read-only: nothing here saves. It reads Rye & Co. and Pulse Fitness (film
 * sets, which no test writes to) as their owner, so the pages hold the same
 * records on every run.
 *
 * A red run writes its findings, one a line, to `a11y-findings.txt` beside
 * the trace. What cannot be fixed yet sits in ALLOW with its reason. Keep it
 * short: an entry is a debt, not an exemption.
 */

const RYE = "seed_sc_rc_org";
const PULSE = "seed_sc_pulse_org";
const PRIYA = "seed_sc_rc_contact_priya";

/** How many Tab presses each focus walk makes (two walks a screen). */
const FOCUS_STOPS = 20;

interface Screen {
    name: string;
    org: string;
    /** The address, or how to find it (a detail page picks a real record). */
    path: string | ((page: Page) => Promise<string>);
}

const SCREENS: Screen[] = [
    { name: "Home", org: RYE, path: "/" },
    { name: "Orders", org: RYE, path: "/commerce/orders" },
    {
        name: "Order detail",
        org: RYE,
        path: async (page) => {
            const res = await page.request.get(
                `${urls.API_URL}/organizations/${RYE}/orders?v=2`,
                { headers: { "x-organization-id": RYE, origin: urls.APP_URL } },
            );
            expect(res.ok()).toBe(true);
            const { rows } = (await res.json()) as { rows: { id: string }[] };
            expect(rows.length).toBeGreaterThan(0);
            return `/commerce/orders/${rows[0]?.id ?? ""}`;
        },
    },
    { name: "Customers", org: RYE, path: "/commerce/customers" },
    { name: "Customer detail", org: RYE, path: `/customers/${PRIYA}` },
    { name: "Calendar", org: PULSE, path: "/calendar" },
    { name: "Bookings", org: PULSE, path: "/bookings" },
    { name: "Products", org: RYE, path: "/commerce/products" },
    { name: "Invoices", org: PULSE, path: "/billing/invoices" },
    { name: "Subscriptions", org: PULSE, path: "/billing/subscriptions" },
    { name: "Settings: business", org: RYE, path: "/settings/organization" },
    { name: "Settings: team", org: RYE, path: "/settings/people" },
    { name: "Settings: modules", org: RYE, path: "/settings/modules" },
    { name: "Settings: plan and billing", org: RYE, path: "/settings/billing" },
    { name: "Settings: your profile", org: RYE, path: "/settings/profile" },
    { name: "Settings: activity", org: RYE, path: "/settings/activity" },
];

/**
 * What is known and not fixed here, each with its reason. `screen` narrows an
 * entry to one screen; `target` is matched against axe's selector and markup,
 * or the element's description. As few as possible.
 */
interface Allow {
    check: "axe" | "cursor" | "focus";
    rule?: string;
    screen?: string;
    target: RegExp;
    reason: string;
}
const ALLOW: Allow[] = [];

function allowed(
    check: Allow["check"],
    screen: string,
    target: string,
    rule?: string,
) {
    return ALLOW.some(
        (a) =>
            a.check === check &&
            (a.rule === undefined || a.rule === rule) &&
            (a.screen === undefined || a.screen === screen) &&
            a.target.test(target),
    );
}

/** The page has drawn its content: no skeleton, nothing busy. */
async function settled(page: Page) {
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator(".skeleton-sweep:visible")).toHaveCount(0);
    await expect(page.locator("[aria-busy=true]:visible")).toHaveCount(0);
}

async function axeViolations(page: Page, screen: string) {
    const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // Next's dev overlay, which a production build does not draw.
        .exclude("nextjs-portal")
        .analyze();
    const found: string[] = [];
    for (const v of results.violations) {
        if (v.impact !== "serious" && v.impact !== "critical") continue;
        for (const node of v.nodes) {
            const target = node.target.join(" ");
            if (allowed("axe", screen, `${target} ${node.html}`, v.id))
                continue;
            const why = (node.failureSummary ?? v.help)
                .split("\n")
                .slice(1)
                .join(" ")
                .trim();
            found.push(
                `${v.id} (${v.impact}): ${target} — ${why}\n      ${node.html.slice(0, 200)}`,
            );
        }
    }
    return found;
}

/** Visible, enabled clickables whose computed cursor is not a pointer. */
async function withoutPointer(page: Page) {
    return page.evaluate(() => {
        const sel = [
            "button",
            "a[href]",
            "summary",
            "[role=button]",
            "[role=link]",
            "[role=radio]",
            "[role=tab]",
            "[role=menuitem]",
            "[role=menuitemradio]",
            "[role=menuitemcheckbox]",
            "[role=checkbox]",
            "[role=switch]",
            "[role=option]",
        ].join(",");
        const describe = (el: Element) => {
            const label =
                el.getAttribute("aria-label") ??
                el.textContent.trim().replace(/\s+/g, " ");
            const role = el.getAttribute("role");
            return `<${el.tagName.toLowerCase()}${role ? ` role=${role}` : ""}> "${label.slice(0, 40)}" cursor=${getComputedStyle(el).cursor} .${(el.getAttribute("class") ?? "").slice(0, 100)}`;
        };
        return [...document.querySelectorAll<HTMLElement>(sel)]
            .filter((el) => {
                if (
                    (el as HTMLButtonElement).disabled ||
                    el.getAttribute("aria-disabled") === "true" ||
                    el.hasAttribute("data-disabled") ||
                    el.closest("[inert]")
                )
                    return false;
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return (
                    r.width > 1 &&
                    r.height > 1 &&
                    s.visibility !== "hidden" &&
                    s.pointerEvents !== "none"
                );
            })
            .filter((el) => getComputedStyle(el).cursor !== "pointer")
            .map(describe);
    });
}

/**
 * Tab through the page and report each stop whose focus draws nothing new.
 *
 * Each stop is tagged as it is reached and its focused look recorded: the
 * outline and box-shadow of the element, of its ::before and ::after (a
 * stretched row link draws its ring on ::after), and of its two nearest
 * ancestors (a `focus-within` ring). The resting look is read afterwards,
 * with focus gone, off the same elements. A stop whose look did not change
 * shows a keyboard user nothing.
 *
 * Every read waits for the transitions the focus change started. Under the
 * reduced-motion clamp every element transitions `all` for 0.01ms
 * (globals.css), so a box-shadow ring read in the same frame as its focus
 * or blur still has its old value: the last stop, blurred just before the
 * resting read, looked exactly as it did focused and was reported with a
 * ring on screen (#765).
 *
 * `from` is where the walk starts: the top of the document, as a keyboard
 * user arriving would, or the start of the page's own content, past the
 * shell's rail — otherwise every screen would walk the same navigation.
 */
async function focusWithoutIndicator(page: Page, from: "top" | "main") {
    await page.evaluate((from) => {
        const look = (el: HTMLElement) => {
            const chain: HTMLElement[] = [];
            let at: HTMLElement | null = el;
            for (let d = 0; d < 3 && at; d++, at = at.parentElement)
                chain.push(at);
            return chain
                .flatMap((n) =>
                    [null, "::before", "::after"].map((pseudo) => {
                        const s = getComputedStyle(n, pseudo);
                        return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}|${s.boxShadow}`;
                    }),
                )
                .join(" / ");
        };
        // Every transition and finite animation run out, as `audit` waits.
        const settle = () =>
            Promise.all(
                document
                    .getAnimations()
                    .filter(
                        (a) => a.effect?.getTiming().iterations !== Infinity,
                    )
                    .map((a) => a.finished.catch(() => undefined)),
            );
        Object.assign(window, { __a11yLook: look, __a11ySettle: settle });
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
        const main = document.querySelector<HTMLElement>("main");
        if (from === "main" && main) {
            // Focus the region itself (not a stop of its own), so the next
            // Tab lands on its first control.
            const had = main.getAttribute("tabindex");
            main.setAttribute("tabindex", "-1");
            main.focus({ preventScroll: true });
            if (had === null) main.removeAttribute("tabindex");
        }
    }, from);
    const focused: (string | null)[] = [];
    for (let i = 0; i < FOCUS_STOPS; i++) {
        await page.keyboard.press("Tab");
        focused.push(
            await page.evaluate(async (i) => {
                const w = window as unknown as {
                    __a11yLook: (el: HTMLElement) => string;
                    __a11ySettle: () => Promise<unknown>;
                };
                await w.__a11ySettle();
                const el = document.activeElement as HTMLElement | null;
                // Next's dev overlay takes a stop in development only.
                if (
                    !el ||
                    el === document.body ||
                    el.localName === "nextjs-portal"
                )
                    return null;
                el.setAttribute(
                    "data-a11y-stop",
                    `${el.getAttribute("data-a11y-stop") ?? ""} ${i}`.trim(),
                );
                return w.__a11yLook(el);
            }, i),
        );
    }
    return page.evaluate(async (focused) => {
        (document.activeElement as HTMLElement | null)?.blur();
        const w = window as unknown as {
            __a11yLook: (el: HTMLElement) => string;
            __a11ySettle: () => Promise<unknown>;
        };
        await w.__a11ySettle();
        const out = new Set<string>();
        focused.forEach((styles, i) => {
            if (!styles) return;
            const el = document.querySelector<HTMLElement>(
                `[data-a11y-stop~="${i}"]`,
            );
            if (!el || styles !== w.__a11yLook(el)) return;
            const label =
                el.getAttribute("aria-label") ??
                el.textContent.trim().replace(/\s+/g, " ");
            out.add(
                `<${el.tagName.toLowerCase()}> "${label.slice(0, 40)}" .${(el.getAttribute("class") ?? "").slice(0, 100)}`,
            );
        });
        document
            .querySelectorAll("[data-a11y-stop]")
            .forEach((n) => n.removeAttribute("data-a11y-stop"));
        return [...out];
    }, focused);
}

async function audit(page: Page, screen: string, testInfo: TestInfo) {
    // Every entrance has finished: a row caught mid-fade measures as low
    // contrast, and a ring caught mid-transition as no ring at all.
    await page.evaluate(() =>
        Promise.all(
            document
                .getAnimations()
                .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => undefined)),
        ),
    );
    const axe = await axeViolations(page, screen);
    const cursor = (await withoutPointer(page)).filter(
        (t) => !allowed("cursor", screen, t),
    );
    const focus = [
        ...new Set([
            ...(await focusWithoutIndicator(page, "top")),
            ...(await focusWithoutIndicator(page, "main")),
        ]),
    ].filter((t) => !allowed("focus", screen, t));
    const report = [
        ...axe.map((v) => `axe  ${v}`),
        ...cursor.map((c) => `cursor  ${c}`),
        ...focus.map((f) => `focus  ${f}`),
    ];
    if (report.length > 0) {
        // Kept beside the trace, one finding a line, so a red run says what
        // to fix without replaying it.
        const file = testInfo.outputPath("a11y-findings.txt");
        fs.writeFileSync(file, report.join("\n"));
        await testInfo.attach(`${screen} findings`, {
            path: file,
            contentType: "text/plain",
        });
    }
    expect
        .soft(axe, `${screen}: serious or critical axe violations`)
        .toEqual([]);
    expect
        .soft(cursor, `${screen}: clickables without a pointer cursor`)
        .toEqual([]);
    expect
        .soft(focus, `${screen}: focus stops that draw no indicator`)
        .toEqual([]);
}

test.describe("every main screen is accessible and says what is clickable", () => {
    for (const screen of SCREENS) {
        test(screen.name, async ({ page }, testInfo) => {
            // Motion is clamped (globals.css), so what is measured is the
            // page at rest rather than a frame of its entrance.
            await page.emulateMedia({ reducedMotion: "reduce" });
            await useSession(page);
            await page.goto(`/open/${screen.org}`);
            const path =
                typeof screen.path === "string"
                    ? screen.path
                    : await screen.path(page);
            await page.goto(path);
            await settled(page);
            await audit(page, screen.name, testInfo);
        });
    }

    test("Accounts: sign in", async ({ page }, testInfo) => {
        // Signed out: this test's own context carries no saved session.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${urls.ACCOUNTS_URL}/login`);
        await expect(page.getByLabel("Email")).toBeVisible();
        await audit(page, "Accounts: sign in", testInfo);
    });
});
