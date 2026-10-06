import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Scrollers that mean to scroll, allowed on every call: ScrollX's box
 * (`data-scroll-x`, which fades its edge and hints), a tab strip and a
 * calendar grid.
 */
export const SIDEWAYS_SCROLLERS = [
    "[data-scroll-x]",
    '[role="tablist"]',
    '[role="grid"]',
];

/**
 * What hides sideways inside `main` (Phone Tables audit T10): every element
 * that clips or scrolls content wider than itself. The page-wide check
 * (`scrollWidth <= innerWidth`) passes a 600px table inside an
 * `overflow-x-auto` card, which is how Can sell and Status went missing on
 * a phone (T4, T5).
 *
 * Left out, as the design has them: text cut with an ellipsis (it says
 * there is more), a screen reader's 1px text, the `SIDEWAYS_SCROLLERS`
 * (ScrollX, tab strips, calendar grids), and whatever matches `allow`.
 *
 * Returns the culprits ("div.overflow-x-auto 636>356"), empty when nothing
 * hides. Also returns the layout width, so a test can fail when a phone
 * zoomed out to fit (`innerWidth` grows with overflow on a mobile viewport).
 */
export async function hiddenSideways(
    page: Page,
    allow: string[] = [],
): Promise<{ innerWidth: number; culprits: string[] }> {
    return page.evaluate(
        (allowed) => {
            const culprits: string[] = [];
            for (const el of Array.from(
                document.querySelectorAll<HTMLElement>("main *"),
            )) {
                if (el.clientWidth <= 1) continue;
                if (el.scrollWidth <= el.clientWidth + 1) continue;
                const style = getComputedStyle(el);
                if (style.overflowX === "visible") continue;
                if (style.textOverflow === "ellipsis") continue;
                if (allowed.some((sel) => el.closest(sel))) continue;
                const cls = (el.getAttribute("class") ?? "")
                    .split(/\s+/)
                    .slice(0, 3)
                    .join(".");
                culprits.push(
                    `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} ${el.scrollWidth}>${el.clientWidth}`,
                );
            }
            return { innerWidth: window.innerWidth, culprits };
        },
        [...SIDEWAYS_SCROLLERS, ...allow],
    );
}

/**
 * On a phone nothing hides sideways (docs/patterns/frontend-verification.md):
 * fails, naming the culprits, while anything inside `main` clips or scrolls
 * content wider than itself, or while the page has zoomed out to fit
 * (`innerWidth` grown past the width the test set). Polls, so a list still
 * drawing is waited for and a real overflow fails at the timeout.
 *
 * Use it beside the page-level `scrollWidth <= innerWidth` check, which a
 * 600px table inside an `overflow-x-auto` card passes.
 */
export async function expectNothingHiddenSideways(
    page: Page,
    { allow = [] }: { allow?: string[] } = {},
) {
    const width = page.viewportSize()?.width ?? 0;
    await expect
        .poll(() => hiddenSideways(page, allow), {
            message: `nothing inside main hides sideways at ${width}px`,
        })
        .toEqual({ innerWidth: width, culprits: [] });
}
