/**
 * Site flags — the nine advisory checks from the website spec (§2, "Flags —
 * quiet until publish").
 *
 * Two rules from the spec govern everything here:
 *
 *   "Nothing blocks publishing. All flags are advisory."
 *   "Only the dot in the rail and the per-field marker show while editing.
 *    Outlines and banners appear in the pre-publish check."
 *
 * So this module NEVER throws and never refuses anything. It reports.
 *
 * It lives on the server and is the single source of truth. The editor could
 * have run the same rules in the browser to update a dot per keystroke, but two
 * implementations of nine rules is two sets of answers that drift, and the
 * merchant would be shown one thing while publishing another — the same reason
 * the style palette is served rather than duplicated. "Quiet until publish"
 * also means a dot that settles after a save is truer to the design than one
 * that flickers as you type.
 *
 * The voice is the spec's: warm, a little human (§6). A flag says what is
 * wrong in the merchant's own terms, not the schema's.
 */

/**
 * The nine types, spelled out even where the data to detect them does not exist
 * yet. Naming all nine keeps the vocabulary the spec settled on, and makes the
 * two that are unimplementable today visible rather than quietly missing.
 */
export type FlagType =
    | "emptyRequiredField"
    | "placeholderText"
    | "missingImage"
    | "hiddenButLinked"
    | "pageNotInNavigation"
    | "unpublishedChanges"
    | "missingSeoDescription"
    | "brokenLink"
    | "phoneWidth";

/**
 * The two of the nine that cannot be computed yet. Both need the Navigation
 * model from spec §3, which is not built: without a navigation there is no
 * "linked from navigation" to be hidden from, and no navigation for a page to
 * be missing from. Listed here rather than silently absent so the gap is a
 * fact in the code, not something to rediscover.
 */
export const FLAGS_AWAITING_NAVIGATION: readonly FlagType[] = [
    "hiddenButLinked",
    "pageNotInNavigation",
];

export interface Flag {
    type: FlagType;
    /** What the merchant should read. Warm, specific, never a schema error. */
    message: string;
    /** The page this is about; null for whole-site flags. */
    pageId: string | null;
    /** Index into that page's draft sections; null when not section-specific. */
    sectionIndex: number | null;
    /**
     * The field inside the section, when there is one. This is what draws the
     * per-field marker in the field panel; a flag with no field only draws the
     * dot on the rail row.
     */
    field: string | null;
}

/** One page's sections as the checks need them. */
export interface FlagPageInput {
    id: string;
    path: string;
    title: string;
    /** A hidden page is not on the live site (#197). */
    hidden: boolean;
    sections: { type: string; content: unknown; hidden: boolean }[];
}

export interface FlagSiteInput {
    pages: FlagPageInput[];
    seoDescription: string | null;
    /** Whether the site has ever been published. */
    published: boolean;
    /** Whether the draft differs from what is live. */
    hasUnpublishedChanges: boolean;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * Text a merchant clearly has not written yet.
 *
 * Deliberately a small, high-confidence list. A placeholder check that fires on
 * ordinary copy trains people to ignore every flag, which costs more than the
 * ones it catches — so this matches only strings nobody ships on purpose.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
    /\blorem\s+ipsum\b/i,
    /\bdolor\s+sit\s+amet\b/i,
    /\byour\s+(heading|headline|text|title|tagline)\s+here\b/i,
    /\b(TODO|FIXME|TBD)\b/,
    /\bplaceholder\b/i,
    /^x{3,}$/i,
];

function looksLikePlaceholder(value: string): boolean {
    const t = value.trim();
    if (t === "") return false;
    return PLACEHOLDER_PATTERNS.some((re) => re.test(t));
}

/** Strip tags so a rich-text check reads the words, not the markup. */
function textOf(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function str(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function obj(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null
        ? (v as Record<string, unknown>)
        : {};
}

/**
 * A hero heading long enough to break at phone width.
 *
 * The spec resolved a contradiction here: the sites genuinely reflow, so this
 * "catches only genuine cases — one long hero heading, one four-column grid
 * that can't stack cleanly." A hero heading is set large; past roughly this
 * many characters it wraps to four or more lines on a 390px handset and pushes
 * everything below the fold.
 */
const HERO_HEADING_PHONE_LIMIT = 60;

/** Checks for one section. Returns every flag it raises. */
function checkSection(
    page: FlagPageInput,
    index: number,
    section: { type: string; content: unknown; hidden: boolean },
    pagePaths: Set<string>,
): Flag[] {
    const flags: Flag[] = [];
    const c = obj(section.content);
    const at = (type: FlagType, message: string, field: string | null) =>
        flags.push({
            type,
            message,
            pageId: page.id,
            sectionIndex: index,
            field,
        });

    /*
     * A hidden section is not checked. It is not on the live site, so telling
     * the merchant its heading is empty is telling them about a problem that
     * does not exist — and the pre-publish check would be full of noise from
     * work they have deliberately parked.
     */
    if (section.hidden) return flags;

    switch (section.type) {
        case "hero": {
            const heading = str(c.heading);
            if (heading.trim() === "") {
                at(
                    "emptyRequiredField",
                    "This hero has no heading.",
                    "heading",
                );
            } else if (looksLikePlaceholder(heading)) {
                at(
                    "placeholderText",
                    "The hero heading still has placeholder text in it.",
                    "heading",
                );
            } else if (heading.length > HERO_HEADING_PHONE_LIMIT) {
                at(
                    "phoneWidth",
                    "This heading is long enough to fill most of a phone screen before anything else shows.",
                    "heading",
                );
            }

            const sub = str(c.subheading);
            if (sub !== "" && looksLikePlaceholder(sub)) {
                at(
                    "placeholderText",
                    "The hero subheading still has placeholder text in it.",
                    "subheading",
                );
            }

            // A hero is the one section built around an image.
            const image = obj(c.image);
            if (str(image.src).trim() === "") {
                at("missingImage", "This hero has no image.", "image");
            }

            const cta = obj(c.cta);
            const href = str(cta.href);
            if (href !== "" && isBrokenInternalLink(href, pagePaths)) {
                at(
                    "brokenLink",
                    `The hero button points at ${href}, which is not a page on this site.`,
                    "cta",
                );
            }
            break;
        }

        case "richText": {
            const text = textOf(str(c.value));
            if (text === "") {
                at(
                    "emptyRequiredField",
                    "This text section is empty.",
                    "value",
                );
            } else if (looksLikePlaceholder(text)) {
                at(
                    "placeholderText",
                    "This text section still has placeholder text in it.",
                    "value",
                );
            }
            break;
        }

        case "cta": {
            const label = str(c.label);
            if (label.trim() === "") {
                at("emptyRequiredField", "This button has no label.", "label");
            } else if (looksLikePlaceholder(label)) {
                at(
                    "placeholderText",
                    "The button label still has placeholder text in it.",
                    "label",
                );
            }
            const href = str(c.href);
            if (href.trim() === "") {
                at("emptyRequiredField", "This button goes nowhere.", "href");
            } else if (isBrokenInternalLink(href, pagePaths)) {
                at(
                    "brokenLink",
                    `This button points at ${href}, which is not a page on this site.`,
                    "href",
                );
            }
            break;
        }

        case "gallery": {
            const images = Array.isArray(c.images) ? c.images : [];
            if (images.length === 0) {
                at("missingImage", "This gallery has no images yet.", "images");
            }
            /*
             * Four across is the case the spec names: three stack cleanly on a
             * phone, four leaves a widow on the second row and the images end
             * up too small to make out.
             */
            if (c.layout === "grid" && images.length === 4) {
                at(
                    "phoneWidth",
                    "Four images in a grid do not stack evenly on a phone.",
                    "images",
                );
            }
            break;
        }

        case "enquiry": {
            const fields = Array.isArray(c.fields) ? c.fields : [];
            if (fields.length === 0) {
                at(
                    "emptyRequiredField",
                    "This form has no fields, so there is nothing for anyone to fill in.",
                    "fields",
                );
            }
            break;
        }

        case "booking": {
            if (str(c.serviceId).trim() === "") {
                at(
                    "emptyRequiredField",
                    "This booking section is not pointed at a service yet.",
                    "serviceId",
                );
            }
            break;
        }

        default:
            // An unknown type is not a flag. The contract already rejects types
            // it does not know, so anything reaching here is a type this
            // version simply has no checks for.
            break;
    }

    return flags;
}

/**
 * Whether an internal link points at no page on this site.
 *
 * Only root-relative links are judged. An external URL would need a network
 * request to check, and a pre-publish screen that stalls on someone else's
 * slow server — or wrongly calls a live site broken — is worse than one that
 * stays quiet about links it cannot see.
 */
function isBrokenInternalLink(href: string, pagePaths: Set<string>): boolean {
    if (!href.startsWith("/")) return false;
    // Compare the path alone: /about#hours and /about are the same page.
    const path = href.split(/[?#]/)[0].replace(/\/+$/, "");
    return !pagePaths.has(path === "" ? "/" : path);
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Every flag on a site, in the order the pre-publish check shows them: site-wide
 * first, then page by page in the site's own page order.
 */
export function checkSite(site: FlagSiteInput): Flag[] {
    const flags: Flag[] = [];
    /*
     * Only VISIBLE pages count as pages that exist.
     *
     * A button pointing at a page the merchant has hidden is broken in exactly
     * the way `brokenLink` describes — the visitor clicking it gets nothing —
     * so hiding a linked page has to surface here rather than quietly becoming
     * a dead link on a live site. This is the page-level half of what
     * `hiddenButLinked` will do for sections once there is a navigation to be
     * linked from (§3).
     */
    const pagePaths = new Set(
        site.pages.filter((p) => !p.hidden).map((p) => p.path),
    );

    if ((site.seoDescription ?? "").trim() === "") {
        flags.push({
            type: "missingSeoDescription",
            message:
                "This site has no search description, so Google will pick its own words for the listing.",
            pageId: null,
            sectionIndex: null,
            field: "seoDescription",
        });
    }

    /*
     * Only meaningful once something is live. Before the first publish the
     * whole site is unpublished, and saying so is not news — the first-run
     * nudge covers that state instead (spec §5).
     */
    if (site.published && site.hasUnpublishedChanges) {
        flags.push({
            type: "unpublishedChanges",
            message: "There are edits here that visitors cannot see yet.",
            pageId: null,
            sectionIndex: null,
            field: null,
        });
    }

    for (const page of site.pages) {
        /*
         * A hidden page raises nothing, on the same reasoning that keeps a
         * hidden section quiet: it is not on the live site, so flagging its
         * empty heading reports a problem that does not exist and fills the
         * check with noise from work deliberately set aside.
         */
        if (page.hidden) continue;
        page.sections.forEach((section, index) => {
            flags.push(...checkSection(page, index, section, pagePaths));
        });
    }

    return flags;
}

/** Flags on one page's sections, for the rail dots and per-field markers. */
export function checkPage(page: FlagPageInput, allPagePaths: string[]): Flag[] {
    const paths = new Set(allPagePaths);
    return page.sections.flatMap((section, index) =>
        checkSection(page, index, section, paths),
    );
}
