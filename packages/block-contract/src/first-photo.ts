/**
 * The first photo on a page (Pages list rows, ERVBoardFixes 6): the first
 * `src` in its sections' content, in section order, with the widths of its
 * stored smaller copies when it has them. A section's `frame` is its
 * settings, not its content, so it is skipped. Null when the page has none.
 */
export interface FirstPhoto {
    src: string;
    widths?: number[] | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
    v !== null && typeof v === "object" && !Array.isArray(v);

function find(value: unknown): FirstPhoto | null {
    if (Array.isArray(value)) {
        for (const v of value) {
            const found = find(v);
            if (found) return found;
        }
        return null;
    }
    if (!isObj(value)) return null;
    if (typeof value.src === "string" && value.src !== "") {
        const widths = Array.isArray(value.widths)
            ? value.widths.filter((w): w is number => typeof w === "number")
            : null;
        return { src: value.src, ...(widths?.length ? { widths } : {}) };
    }
    for (const [key, v] of Object.entries(value)) {
        if (key === "frame") continue;
        const found = find(v);
        if (found) return found;
    }
    return null;
}

/** The first photo across a page's sections' content, in order. */
export function firstPhotoOf(contents: readonly unknown[]): FirstPhoto | null {
    for (const content of contents) {
        const found = find(content);
        if (found) return found;
    }
    return null;
}
