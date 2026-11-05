import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "styles.css"), "utf8");

/**
 * Classes drawn under `root` that styles.css doesn't style. For tests:
 * prettier-plugin-tailwindcss strips the space before a class inside a
 * className template (`" on"` → `vc-timeon`, DEV_LEARNINGS 26 Oct), so
 * every class a page or tool draws must be one the stylesheet has.
 */
export function unknownClasses(
    root: HTMLElement,
    /** A template's own stylesheet, beside styles.css. */
    extra = "",
): string[] {
    const all = css + extra;
    const unknown = new Set<string>();
    root.querySelectorAll("[class]").forEach((el) => {
        for (const c of (el.getAttribute("class") ?? "").split(/\s+/)) {
            if (c && !new RegExp(`\\.${c}(?![\\w-])`).test(all)) unknown.add(c);
        }
    });
    return [...unknown];
}
