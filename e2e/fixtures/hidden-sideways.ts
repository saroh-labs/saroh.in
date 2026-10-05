import type { Page } from "@playwright/test";

/**
 * What hides sideways inside `main` (Phone Tables audit T10): every element
 * that clips or scrolls content wider than itself. The page-wide check
 * (`scrollWidth <= innerWidth`) passes a 600px table inside an
 * `overflow-x-auto` card, which is how Can sell and Status went missing on
 * a phone (T4, T5).
 *
 * Left out, as the design has them: text cut with an ellipsis (it says
 * there is more), a screen reader's 1px text, and whatever matches `allow`
 * — a tab strip that scrolls on purpose.
 *
 * Returns the culprits ("div.overflow-x-auto 636>356"), empty when nothing
 * hides. Also returns the layout width, so a test can fail when a phone
 * zoomed out to fit (`innerWidth` grows with overflow on a mobile viewport).
 */
export async function hiddenSideways(
    page: Page,
    allow: string[] = [],
): Promise<{ innerWidth: number; culprits: string[] }> {
    return page.evaluate((allowed) => {
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
    }, allow);
}
