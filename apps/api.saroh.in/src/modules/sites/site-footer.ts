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

/** A footer as stored on `Site.footer` and served in the snapshot. */
export interface SiteFooter {
    format: "html" | "markdown";
    value: string;
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

    // Trailing whitespace in authored HTML is noise; an all-whitespace value is
    // an empty footer however it was typed.
    if (rawValue.trim() === "") return null;

    return { format: rawFormat, value: rawValue };
}
