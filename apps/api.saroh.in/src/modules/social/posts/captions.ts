import type { ChannelKind } from "../meta/social-meta.port";

/**
 * Each channel's words for one post (KTD8), pure:
 *
 * - Instagram: links in a caption aren't clickable there, so the link
 *   goes as plain text under "Link in bio", within 2,200 characters.
 * - Facebook: the link inline, where it becomes a preview.
 * - Threads: the link inline, within 500 UTF-8 bytes; the post's own
 *   words are cut with an ellipsis to fit. A caption written for Threads
 *   alone must fit as it is (the composer warns first).
 *
 * The link is never cut: it carries the post's `ref`, which is how its
 * visits are counted and how an unclear publish is found again.
 */

export const INSTAGRAM_MAX_CHARS = 2200;
export const THREADS_MAX_BYTES = 500;

const ELLIPSIS = "…";
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** The post's link with its ref: `https://site/path?ref=social-abc`. */
export function trackedLink(
    origin: string,
    linkPath: string,
    ref: string,
): string {
    const url = new URL(linkPath, `${origin.replace(/\/$/, "")}/`);
    url.searchParams.set("ref", ref);
    return url.toString();
}

/** How the words and the link join, per channel. */
function join(kind: ChannelKind, text: string, link: string): string {
    const words = text.trim();
    const tail = kind === "INSTAGRAM" ? `Link in bio\n${link}` : link;
    return words ? `${words}\n\n${tail}` : tail;
}

/** Cut `text` (by whole characters) until `fits` holds, adding an ellipsis. */
function cutToFit(text: string, fits: (t: string) => boolean): string {
    if (fits(text)) return text;
    const chars = Array.from(text.trim());
    while (chars.length > 0) {
        chars.pop();
        const cut = `${chars.join("").trimEnd()}${ELLIPSIS}`;
        if (fits(cut)) return cut;
    }
    return "";
}

/**
 * The caption `kind` posts: its own words when it has them, else the
 * post's, cut to fit when they are the post's.
 */
export function captionFor(
    kind: ChannelKind,
    caption: string,
    override: string | null | undefined,
    link: string,
): string {
    const own = override?.trim() ? override : null;
    const text = own ?? caption;
    if (kind === "THREADS") {
        const fits = (t: string) =>
            bytes(join(kind, t, link)) <= THREADS_MAX_BYTES;
        return join(kind, own ? text : cutToFit(text, fits), link);
    }
    if (kind === "INSTAGRAM") {
        const fits = (t: string) =>
            Array.from(join(kind, t, link)).length <= INSTAGRAM_MAX_CHARS;
        return join(kind, own ? text : cutToFit(text, fits), link);
    }
    return join(kind, text, link);
}

/**
 * Why a channel's own caption can't go as it is, or null: Threads counts
 * bytes (an Indian script's letter is three), Instagram characters.
 */
export function captionProblem(
    kind: ChannelKind,
    override: string,
    link: string,
): { limit: number; used: number; unit: "bytes" | "characters" } | null {
    const full = join(kind, override, link);
    if (kind === "THREADS" && bytes(full) > THREADS_MAX_BYTES) {
        return { limit: THREADS_MAX_BYTES, used: bytes(full), unit: "bytes" };
    }
    if (kind === "INSTAGRAM" && Array.from(full).length > INSTAGRAM_MAX_CHARS) {
        return {
            limit: INSTAGRAM_MAX_CHARS,
            used: Array.from(full).length,
            unit: "characters",
        };
    }
    return null;
}
