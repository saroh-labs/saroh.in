import { BadRequestException } from "@nestjs/common";

/**
 * The site footer (#202).
 *
 * The Style panel has offered a Footer colour row since #189 and nothing has
 * ever painted it: `--site-footer-bg` and `--site-footer-fg` were resolved and
 * published, and the public layout had no footer to apply them to. Five
 * swatches that looked exactly like the five rows above them, and did nothing —
 * a control that lies is worse than one that is missing, because the merchant
 * comes away believing they set something.
 *
 * WHY AUTHORED RATHER THAN DERIVED. The obvious shortcut is to build a footer
 * out of what we already know: the business name from `BusinessProfile`, its
 * contact email underneath. That shortcut is wrong. `org:settings:read` gates
 * those fields to OWNER/ADMIN precisely because legal name, tax id and contact
 * email are sensitive business identity, and a merchant handed them over for
 * billing and tax. Publishing them to the open internet would repurpose data
 * collected for one thing into something else without ever asking. So the
 * footer is written by the merchant, or it does not exist.
 *
 * WHY THE richText SHAPE. `{ format, value }` is what a richText section
 * already carries, so this reuses the authoring model, the publish-time
 * sanitizer and — when the rich text editor lands (#208) — the editor itself.
 * A bespoke footer content model would be a second thing to keep in step with
 * the first, for no gain.
 */

/**
 * How the footer is laid out (industry templates, polish pass). Absent is
 * today's single centred line; `left` is the designs' row — the name in the
 * heading face, the merchant's line, "Runs on Saroh" at the far end. Kept in
 * the renderer as `FOOTER_LAYOUTS` (site-blocks); a spec holds them equal.
 */
export const FOOTER_LAYOUTS = ["centre", "left"] as const;
export type FooterLayout = (typeof FOOTER_LAYOUTS)[number];

/** A footer as stored on `Site.footer` and served in the snapshot. */
export interface SiteFooter {
    format: "html" | "markdown";
    value: string;
    /** `left`, or absent for the centred line ("centre" is stored as absent). */
    layout?: "left";
}

/**
 * Bounded so a footer stays a footer.
 *
 * Not a safety limit — the sanitizer is that — but a shape one. A footer is a
 * closing line, an address, a couple of links; something that runs to pages is
 * a page, and the merchant has those. The cap is generous enough that nobody
 * writing an actual footer will meet it.
 */
export const FOOTER_MAX_LENGTH = 10_000;

/**
 * Parse whatever the client sent into a footer, or `null` for "no footer".
 *
 * EMPTY MEANS ABSENT. A footer of whitespace is not a footer the merchant
 * wrote, and rendering an empty coloured band because someone cleared the box
 * is the same class of over-claim as rendering an absent price as zero. Both
 * `null` and a blank value collapse to `null`, so clearing the field is how a
 * merchant removes the footer — there is no separate delete.
 *
 * A malformed shape THROWS rather than being quietly dropped, on the same
 * reasoning `parseSiteStyle` follows: a client sending the wrong thing has a
 * bug, and silently storing nothing would hide it until a merchant noticed
 * their footer had never saved.
 */
export function parseSiteFooter(input: unknown): SiteFooter | null {
    if (input === null || input === undefined) return null;

    if (typeof input !== "object" || Array.isArray(input)) {
        throw new BadRequestException(
            "footer must be an object with a format and a value, or null.",
        );
    }

    const o = input as Record<string, unknown>;

    const rawFormat = o.format ?? "html";
    if (rawFormat !== "html" && rawFormat !== "markdown") {
        throw new BadRequestException(
            'footer.format must be "html" or "markdown".',
        );
    }

    const rawValue = o.value ?? "";
    if (typeof rawValue !== "string") {
        throw new BadRequestException("footer.value must be a string.");
    }
    if (rawValue.length > FOOTER_MAX_LENGTH) {
        throw new BadRequestException(
            `A footer must be at most ${FOOTER_MAX_LENGTH} characters.`,
        );
    }

    const rawLayout = o.layout ?? "centre";
    if (!(FOOTER_LAYOUTS as readonly unknown[]).includes(rawLayout)) {
        throw new BadRequestException(
            `footer.layout must be one of ${FOOTER_LAYOUTS.join(", ")}.`,
        );
    }
    const layout = rawLayout === "left" ? { layout: "left" as const } : {};

    // Trailing whitespace in authored HTML is noise; an all-whitespace value is
    // an empty footer however it was typed. A footer laid out on the left
    // keeps its layout with no line: the row is then the name and "Runs on
    // Saroh", and a line written later lands in it.
    if (rawValue.trim() === "") {
        return layout.layout
            ? { format: rawFormat, value: "", ...layout }
            : null;
    }

    return { format: rawFormat, value: rawValue, ...layout };
}

/**
 * The footer an update stores (#202): what was sent, keeping the stored
 * layout when the update does not name one. The footer's two editors (Site
 * settings and the editor's footer line) send only the line, so a template's
 * left-hand row survives the merchant rewriting the line, or clearing it.
 */
export function footerAfterUpdate(
    input: unknown,
    stored: unknown,
): SiteFooter | null {
    const parsed = parseSiteFooter(input);
    const named =
        input !== null &&
        typeof input === "object" &&
        (input as { layout?: unknown }).layout !== undefined;
    if (named) return parsed;
    let kept: SiteFooter | null = null;
    try {
        kept = parseSiteFooter(stored);
    } catch {
        // A stored footer that no longer parses carries no layout to keep.
    }
    if (kept?.layout !== "left") return parsed;
    return parsed
        ? { ...parsed, layout: "left" }
        : { format: kept.format, value: "", layout: "left" };
}
