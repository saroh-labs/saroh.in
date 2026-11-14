// @covers app:/open app:/ api:ai
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Ask AI's panel (plan 2026-11-13-001 U10), desk and phone.
 *
 * Runs now: the way in and out. The top bar's button (a spark beside
 * Search on a phone) opens the panel over the page, ⌘J toggles it, Esc
 * and Close shut it and give the keyboard back; on a phone it is a
 * full-screen sheet whose controls are 44px. Whatever the business's Ask
 * AI state on the seeded stack (the `ASK_AI` switch is off there, so the
 * panel says it isn't available, or the plan locks it), these hold, and
 * nothing is asked or saved.
 *
 * Skipped: asking. A question streams from the API's AI provider, and the
 * API binds the real one (`AiSdkAdapter`, `ai.module.ts`) with no way to
 * put the `FakeAiProvider` in its place on a running stack. To run them:
 *   1. an env switch in `apps/api.saroh.in/src/env.ts` (e.g.
 *      `AI_PROVIDER=fake`, refused in production) that binds a scripted
 *      `FakeAiProvider` in `ai.module.ts`, with scripts keyed by question
 *      text (a status, text deltas, a draft card, a slow answer for Stop);
 *   2. the seed turning `ASK_AI` on for Northwind, its plan's Ask AI row
 *      on, an `AiSetting` row for the agent, and `AI_TEXT_ENC_KEY` set on
 *      CI's API;
 *   3. a second, Free business (`makeBusiness`) for the lock.
 */

async function openPanel(page: Page, isMobile: boolean) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const entry = page
        .getByRole("button", { name: /^Ask AI/ })
        .filter({ visible: true });
    const panel = isMobile
        ? page.getByRole("dialog", { name: "Ask AI" })
        : page.getByRole("complementary", { name: "Ask AI" });
    await pressUntil(entry, panel);
    return { entry, panel };
}

test.describe("Ask AI: the way in and out", () => {
    test("the button opens the panel, Close and Esc shut it", async ({
        page,
        isMobile,
    }) => {
        const { entry, panel } = await openPanel(page, isMobile);
        await expect(
            panel.getByRole("button", { name: "Close Ask AI" }),
        ).toBeVisible();
        if (!isMobile) {
            // Pressed, the desk button stays dark while the panel is open.
            await expect(entry).toHaveAttribute("aria-expanded", "true");
        }

        await panel.getByRole("button", { name: "Close Ask AI" }).click();
        await expect(panel).toBeHidden();
        await expect(entry).toBeFocused();

        await entry.click();
        await expect(panel).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
    });

    test("⌘J opens and shuts it on a desk", async ({ page, isMobile }) => {
        test.skip(isMobile, "A keyboard shortcut: desk only.");
        await useSession(page);
        await page.goto(`/open/${NORTHWIND_ORG}`);
        const panel = page.getByRole("complementary", { name: "Ask AI" });
        await expect(async () => {
            await page.keyboard.press("ControlOrMeta+j");
            await expect(panel).toBeVisible({ timeout: 2_000 });
        }).toPass({ timeout: 20_000 });
        await page.keyboard.press("ControlOrMeta+j");
        await expect(panel).toBeHidden();
    });

    test("on a phone it is full-screen, every control 44px", async ({
        page,
        isMobile,
    }) => {
        test.skip(!isMobile, "Phone widths only.");
        const { panel } = await openPanel(page, isMobile);
        const box = await panel.boundingBox();
        const view = page.viewportSize();
        expect(box?.width).toBe(view?.width);
        for (const control of await panel
            // A link inside a sentence is exempt, as on the merchant site checks.
            .locator("button, a:not(p a)")
            .filter({ visible: true })
            .all()) {
            const size = await control.boundingBox();
            if (!size) continue;
            expect(
                Math.min(size.width, size.height),
                await control.evaluate((e) => e.outerHTML.slice(0, 120)),
            ).toBeGreaterThanOrEqual(44);
        }
    });
});

test.describe("Ask AI: asking", () => {
    test.skip(
        true,
        "Needs a fake AI provider the running API can bind, and Ask AI on for a seeded business: see this file's header.",
    );

    test("the status line first, the answer as it arrives, Stop at once", async ({
        page,
        isMobile,
    }) => {
        const { panel } = await openPanel(page, isMobile);
        await panel
            .getByRole("textbox", { name: "Ask a question" })
            .fill("How many bookings this week?");
        await panel.getByRole("button", { name: "Ask" }).click();
        await expect(
            panel.getByRole("button", { name: "Stop the answer" }),
        ).toBeVisible();
        await expect(panel.getByRole("status").first()).toContainText(
            "Reading",
        );
        await expect(panel.locator('[aria-live="polite"]')).toContainText(
            "bookings",
        );
        await expect(
            panel.getByRole("button", { name: "Report this answer" }),
        ).toBeVisible();
    });

    test("an answer with an image or a link loads nothing from outside", async ({
        page,
        isMobile,
    }) => {
        const outside: string[] = [];
        page.on("request", (r) => {
            if (
                !/saroh|localhost|127\.0\.0\.1/.test(new URL(r.url()).hostname)
            ) {
                outside.push(r.url());
            }
        });
        const { panel } = await openPanel(page, isMobile);
        await panel
            .getByRole("textbox", { name: "Ask a question" })
            .fill("Show me a picture");
        await panel.getByRole("button", { name: "Ask" }).click();
        await expect(panel.locator('[aria-live="polite"]')).toContainText("![");
        await expect(panel.locator('[aria-live="polite"] img')).toHaveCount(0);
        await expect(panel.locator('[aria-live="polite"] a')).toHaveCount(0);
        expect(outside).toEqual([]);
    });

    test("Stop before the answer didn't use a question", async ({
        page,
        isMobile,
    }) => {
        const { panel } = await openPanel(page, isMobile);
        await panel
            .getByRole("textbox", { name: "Ask a question" })
            .fill("A slow question");
        await panel.getByRole("button", { name: "Ask" }).click();
        await panel.getByRole("button", { name: "Stop the answer" }).click();
        await expect(panel).toContainText(
            "Stopped. This didn't use a question.",
        );
    });
});
