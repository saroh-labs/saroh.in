import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * What a press should bring about: a Locator that shows, or a check that
 * answers true once it has happened (a toggle's `aria-pressed`, say).
 */
type Answer = Locator | (() => Promise<boolean>);

/**
 * Press `button` until `answer` is seen. A server-drawn button pressed
 * before React has hydrated does nothing, and on CI's slower runners the
 * page's own client components can hydrate well after the shell, so the
 * first press after a `goto` is lost (DEV_LEARNINGS, "a press before
 * hydration"). It is pressed again only while nothing has answered, so a
 * toggle or a trigger that opens late is never pressed back shut.
 */
export async function pressUntil(
    button: Locator,
    answer: Answer,
    { timeout = 20_000 }: { timeout?: number } = {},
): Promise<void> {
    const answered = async () =>
        typeof answer === "function" ? answer() : answer.isVisible();
    await expect(async () => {
        if (!(await answered())) await button.click({ timeout: 5_000 });
        await expect.poll(answered, { timeout: 2_000 }).toBe(true);
    }).toPass({ timeout });
}
