// @covers app:/open app:/ api:ai
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { pressUntil } from "../fixtures/press";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * Ask AI's panel (plan 2026-11-13-001 U10), desk and phone.
 *
 * The way in and out: the top bar's button (a spark beside Search on a
 * phone) opens the panel over the page, ⌘J toggles it, Esc and Close shut
 * it and give the keyboard back; on a phone it is a full-screen sheet
 * whose controls are 44px.
 *
 * Asking: the stack's API answers from a script, never a model
 * (`AI_PROVIDER_FAKE`, `apps/api.saroh.in/src/modules/ai/providers/
 * fake-script.ts`, keyed by the questions typed here), and the seed turns
 * Ask AI on for Northwind with made-up AI settings
 * (`packages/database/src/seed/ask-ai.ts`). One person runs one turn at a
 * time, so the asking tests are `@serial`. The lock is read on Asha's
 * Candles, on the sample catalogue's entry plan, where Ask AI is locked.
 */

/** Asha's Candles on the entry plan (`packages/database/src/seed/email-prompt.ts`). */
const LOCKED_ORG = "seed_org_email-prompt_free";

async function openPanel(
    page: Page,
    isMobile: boolean,
    on: { who?: "founder"; org: string } = { org: NORTHWIND_ORG },
) {
    await useSession(page, on.who);
    await page.goto(`/open/${on.org}`);
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

async function ask(panel: Locator, question: string) {
    await panel.getByRole("textbox", { name: "Ask a question" }).fill(question);
    await panel.getByRole("button", { name: "Ask" }).click();
}

test.describe("Ask AI: asking", { tag: "@serial" }, () => {
    test("the status line first, then the answer as it arrives", async ({
        page,
        isMobile,
    }) => {
        const { panel } = await openPanel(page, isMobile);
        await ask(panel, "How many bookings this week?");
        await expect(
            panel.getByRole("button", { name: "Stop the answer" }),
        ).toBeVisible();
        await expect(
            panel.getByRole("status").filter({ hasText: "Adding up" }),
        ).toBeVisible();
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
        await ask(panel, "Show me a picture");
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
        await ask(panel, "Stop test");
        await panel.getByRole("button", { name: "Stop the answer" }).click();
        await expect(panel).toContainText(
            "Stopped. This didn't use a question.",
        );
    });

    test("a draft is added only on Confirm", async ({
        page,
        isMobile,
    }, testInfo) => {
        // A create is Added with Open it; Undo is for a change (DEC-220).
        const name = `Ask AI mug ${stamp(testInfo)}`;
        const { panel } = await openPanel(page, isMobile);
        await ask(panel, `Add a product called ${name} at 250`);
        await panel.getByRole("button", { name: "Add product" }).click();
        await expect(panel.getByText(`Added · ${name}`)).toBeVisible();
        await expect(
            panel.getByRole("link", { name: "Open it" }),
        ).toBeVisible();
    });
});

test.describe("Ask AI: on a plan without it", () => {
    test("the panel says which plan brings it", async ({ page, isMobile }) => {
        const { panel } = await openPanel(page, isMobile, {
            who: "founder",
            org: LOCKED_ORG,
        });
        await expect(panel).toContainText("Ask AI comes with");
        await expect(
            panel.getByRole("textbox", { name: "Ask a question" }),
        ).toHaveCount(0);
    });
});
