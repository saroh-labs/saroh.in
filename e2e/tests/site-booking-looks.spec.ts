// @covers site:/book api:bookings api:site-accounts api:sites pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setNorthwindLook } from "../fixtures/site-look";
import { urls } from "../playwright.config";
import { asNewVisitor, expectNoZoomOnFocus, readSiteCode } from "./site-codes";

/**
 * Booking in each look (DEC-172, plan U10, #1100): the same steps in
 * Folio's panel, Quiet's page and Live's sheets, on Northwind's own
 * service, desk and phone (the `desk-serial` and `phone-serial` projects).
 *
 * For Folio, Quiet and Live, a new visitor:
 *
 * - picks the walkthrough, a day and a time, each step's button moving on;
 *   the browser's Back and Forward, and the frame's own Back, walk the
 *   steps inside the look;
 * - types a name and an email, gets the code by email (the stack's code
 *   outbox), enters it inside Your details and reads "Booking as";
 * - chooses to pay at the desk and reaches "You're booked".
 *
 * On every step: one filled button in view, at most one fixed bar on a
 * phone, every control in the frame 44×44 or more on a phone, and nothing
 * off to the side. And: Escape leaves the booking for the page it was
 * opened from, with focus back on the link that opened it.
 *
 * Northwind's days are shared with `public-booking.spec.ts` (the FIRST
 * time of days 1–4 counted back from the furthest on a desk, 5–8 on a
 * phone) and `site-booking-steps.spec.ts` (the LAST time of day 1, phone
 * 5). This takes the SECOND time of day 1, 2 or 3 by look (phone 5, 6, 7),
 * so none of them asks for the same time at once.
 *
 * @serial: it changes and publishes Northwind's site style.
 */

const renderer = new URL(urls.RENDERER_URL);
const SITE = `${renderer.protocol}//northwind.${renderer.host}`;
const LOOKS = ["folio", "quiet", "live"] as const;
const WALKTHROUGH = "Warehouse walkthrough";

const stepOf = (page: Page) => new URL(page.url()).searchParams.get("step");

/** The step's one filled button, as a visitor at this width sees it. */
const stepAction = (page: Page) =>
    page.locator("[data-booking-action]").filter({ visible: true }).first();

/** A free time on the chosen day. */
const timeRadios = (page: Page) =>
    page.locator('[role="radiogroup"] button[role="radio"]', {
        hasText: /^\d{1,2}:\d{2} [ap]m/,
    });

/** The visible buttons in view filled in the site's accent. */
function filledInView(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.background = "hsl(var(--site-accent))";
        document.body.append(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return Array.from(
            document.querySelectorAll<HTMLElement>("a[href], button"),
        )
            .filter((el) => {
                const box = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return (
                    box.width > 0 &&
                    box.height > 0 &&
                    box.bottom > 0 &&
                    box.top < window.innerHeight &&
                    style.visibility !== "hidden" &&
                    style.backgroundColor === accent
                );
            })
            .map((el) => el.textContent.trim() || el.tagName);
    });
}

/** Fixed bands 40px or taller on screen, less Folio's panel itself. */
function fixedBars(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
            .filter((el) => {
                if (el.closest("nextjs-portal")) return false;
                // Folio's panel is a dialog over the page: its foot is
                // inside it, and counted below.
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
                    el.tagName,
            ),
    );
}

/** The frame's controls smaller than 44×44, as "name WxH". */
function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(
            document.querySelectorAll<HTMLElement>(
                "[data-booking-frame] button, [data-booking-frame] a[href], [data-booking-frame] input:not([type=hidden])",
            ),
        )
            .filter((el) => {
                const style = getComputedStyle(el);
                const box = el.getBoundingClientRect();
                return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    box.width > 0 &&
                    (box.width < 43.5 || box.height < 43.5)
                );
            })
            .map((el) => {
                const box = el.getBoundingClientRect();
                const name =
                    el.getAttribute("aria-label") ?? el.textContent.trim();
                return `${name} ${Math.round(box.width)}x${Math.round(box.height)}`;
            }),
    );
}

function sideways(page: Page): Promise<number> {
    return page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
    );
}

/**
 * What every step must hold, at this width. A step that can't go yet
 * draws its button quiet, so it has none filled (`ready` false).
 */
async function holdsTheRules(page: Page, phone: boolean, ready = true) {
    const filled = await filledInView(page);
    if (ready) expect(filled).toHaveLength(1);
    else expect(filled.length).toBeLessThanOrEqual(1);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    if (!phone) return;
    expect((await fixedBars(page)).length).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
}

test.describe("booking in each look", { tag: "@serial" }, () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    LOOKS.forEach((id, n) => {
        test(`${id}: a new visitor books the walkthrough at the desk, with the code inside Your details`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(240_000);
            const phone = testInfo.project.name.startsWith("phone");
            const email = `look-${id}-${testInfo.project.name}-${Date.now()}@example.com`;
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                await page.goto(`${SITE}/book?step=what&v=${Date.now()}`);
                await expect(
                    page.locator(`[data-booking-look="${id}"]`),
                ).toBeVisible({ timeout: 15_000 });

                // What: choosing stays on the step; its button moves on.
                await expect(
                    page.getByRole("heading", {
                        name: "What would you like to book?",
                    }),
                ).toBeVisible();
                await holdsTheRules(page, phone, false);
                await page
                    .getByRole("radio", { name: new RegExp(WALKTHROUGH) })
                    .filter({ visible: true })
                    .first()
                    .click();
                expect(stepOf(page)).toBe("what");
                await holdsTheRules(page, phone);
                await stepAction(page).click();
                await expect.poll(() => stepOf(page)).toMatch(/^(who|when)$/);
                if (stepOf(page) === "who") {
                    await holdsTheRules(page, phone);
                    await stepAction(page).click();
                }
                await expect.poll(() => stepOf(page)).toBe("when");

                // When: a day, then a time.
                const openDays = page.getByRole("radio", {
                    name: /times? free/,
                });
                await expect(openDays.first()).toBeVisible({
                    timeout: 15_000,
                });
                const count = await openDays.count();
                await openDays
                    .nth(Math.max(0, count - (phone ? 5 : 1) - n))
                    .click();
                const times = timeRadios(page);
                await expect(times.first()).toBeVisible({ timeout: 15_000 });
                const time =
                    (await times.count()) > 1 ? times.nth(1) : times.first();
                await time.click();
                await expect(time).toHaveAttribute("aria-checked", "true");
                await holdsTheRules(page, phone);
                await expect(stepAction(page)).toHaveText("Next: your details");
                await stepAction(page).click();
                await expect.poll(() => stepOf(page)).toBe("details");

                // Back and Forward inside the look, then the frame's Back.
                await page.goBack();
                await expect.poll(() => stepOf(page)).toBe("when");
                await expect(time).toHaveAttribute("aria-checked", "true");
                await page.goForward();
                await expect.poll(() => stepOf(page)).toBe("details");
                await page
                    .getByRole("button", { name: "Back a step" })
                    .filter({ visible: true })
                    .first()
                    .click();
                await expect.poll(() => stepOf(page)).toBe("when");
                await stepAction(page).click();
                await expect.poll(() => stepOf(page)).toBe("details");

                // Your details: the code, inside the step.
                await expect(
                    page.getByRole("heading", { name: "Your details" }),
                ).toBeVisible();
                await holdsTheRules(page, phone, false);
                const name = page.getByLabel("Your name");
                await expectNoZoomOnFocus(name);
                await name.fill("Asha Kumar");
                const emailField = page.getByLabel("Email");
                await expectNoZoomOnFocus(emailField);
                await emailField.fill(email);
                await expect(
                    page.getByText(
                        "We'll email a 6-digit code here to confirm it's you. No password.",
                    ),
                ).toBeVisible();
                // Left: the code goes, and its field opens under the email.
                await emailField.press("Tab");
                const code = await readSiteCode(email);
                await expect(
                    page.getByText(
                        `We sent a 6-digit code to ${email} to confirm it's you.`,
                    ),
                ).toBeVisible();
                const codeField = page.getByLabel("Code");
                await expect(codeField).toHaveAttribute(
                    "autocomplete",
                    "one-time-code",
                );
                await expectNoZoomOnFocus(codeField);
                await codeField.fill(code);
                await expect(
                    page.getByText(/^Booking as /).filter({ visible: true }),
                ).toBeVisible({ timeout: 15_000 });
                await holdsTheRules(page, phone);

                // How to pay, at the desk where Northwind takes it.
                await stepAction(page).click();
                await expect.poll(() => stepOf(page)).toMatch(/^(pay|done)$/);
                if (stepOf(page) === "pay") {
                    await expect(
                        page.getByRole("heading", {
                            name: "How would you like to pay?",
                        }),
                    ).toBeVisible();
                    const desk = page.getByRole("radio", {
                        name: /at the desk|pay later/i,
                    });
                    test.skip(
                        (await desk.count()) === 0,
                        "Northwind's walkthrough takes no payment at the desk on this stack",
                    );
                    await desk.first().click();
                    await expect(stepAction(page)).toHaveText(
                        "Confirm booking",
                    );
                    await holdsTheRules(page, phone);
                    await stepAction(page).click();
                }
                await expect(
                    page.getByRole("heading", { name: /^You're booked/ }),
                ).toBeVisible({ timeout: 20_000 });
                await expect.poll(() => stepOf(page)).toBe("done");
                await expect(
                    page.getByRole("button", { name: "Add to calendar" }),
                ).toBeVisible();
                expect(await sideways(page)).toBeLessThanOrEqual(0);
                // The address never carries the email.
                expect(page.url()).not.toContain("example.com");
            } finally {
                await look.restore();
            }
        });

        test(`${id}: Escape leaves for the page it was opened from, focus back on its link`, async ({
            browser,
            page,
        }, testInfo) => {
            test.setTimeout(180_000);
            const look = await setNorthwindLook(browser, id, testInfo);
            try {
                await look.publish();
                await page.goto(`${SITE}/?v=${Date.now()}`);
                const opener = page
                    .locator('main a[href^="/book"]')
                    .filter({ visible: true })
                    .first();
                await expect(opener).toBeVisible({ timeout: 15_000 });
                const href = await opener.getAttribute("href");
                await opener.click();
                await expect(page).toHaveURL(/\/book/);
                await expect(
                    page.locator(`[data-booking-look="${id}"]`),
                ).toBeVisible({ timeout: 15_000 });
                if (id === "folio") {
                    const dialog = page.getByRole("dialog", {
                        name: "Book a time",
                    });
                    await expect(dialog).toHaveAttribute("aria-modal", "true");
                    // Focus is inside the panel, and Tab keeps it there.
                    await page.keyboard.press("Tab");
                    await expect(dialog.locator(":focus")).toHaveCount(1);
                }
                await page.keyboard.press("Escape");
                await expect(page).not.toHaveURL(/\/book/);
                await expect
                    .poll(() =>
                        page.evaluate(() =>
                            document.activeElement?.getAttribute("href"),
                        ),
                    )
                    .toBe(href);
            } finally {
                await look.restore();
            }
        });
    });
});
