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
 * One flag is not advisory: a site with no web address (DEC-069, L5).
 * Published, it would be live at no address at all, so that flag is
 * `blocking` and `publishSite` refuses until the site has one.
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

import type { PageKind } from "@saroh/database";
import { BLOCK_META, exampleTextIn, resolveVariant } from "@saroh/database";

import { trimTrailingSlashes } from "../../common/paths";
import {
    isModulePageKind,
    reservedAgainst,
    reservedPathFor,
} from "./page-kinds";

/** The shop's address, whose page is `checkShop`'s to flag. */
const SHOP_ROOT = "/shop";

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
    | "phoneWidth"
    // The shop (G11), raised only while it is open for the business.
    | "storefrontUnchosen"
    | "reservedAddress"
    // The checkout (G13): the site sells from a storefront that can't take
    // an online order now, so its shop offers "Ask about ordering".
    | "shopCantTakeOrders"
    // A Product grid (G12) that will show nothing, or less than was
    // picked, because what it names isn't on sale at the storefront.
    | "productsNotOnSale"
    // The site has no web address (DEC-069, L5): the one flag that blocks.
    | "addressMissing";

/**
 * Flags that cannot be computed yet. Empty since #206 built the navigation
 * model that `hiddenButLinked` and `pageNotInNavigation` were waiting on;
 * kept as the contract the check screen reads, so a future flag that lands
 * ahead of its data has somewhere honest to be listed.
 */
export const FLAGS_AWAITING_NAVIGATION: readonly FlagType[] = [];

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
    /**
     * Publishing is refused until this is fixed. Only `addressMissing` sets
     * it; every other flag is advisory and leaves it out.
     */
    blocking?: true;
}

/** One page's sections as the checks need them. */
export interface FlagPageInput {
    id: string;
    path: string;
    title: string;
    /** A hidden page is not on the live site (#197). */
    hidden: boolean;
    /** FREE, or the module page this is (G14). Absent means FREE. */
    kind?: string;
    /** "Show in menu" (G14). Absent means on. */
    inMenu?: boolean;
    sections: { type: string; content: unknown; hidden: boolean }[];
}

export interface FlagSiteInput {
    pages: FlagPageInput[];
    /** The site's menu, by page id (#206). Null when none has been built. */
    navigation: { items: { pageId: string }[] } | null;
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

/**
 * The words an industry template ships in place of the owner's own
 * (template polish): text that says it is a placeholder, or that tells the
 * owner what to write — "Your degree — the subject, where you studied",
 * "Say how the work is fired", "Your first coach". Matched at the START of
 * a piece of text and on a template's own phrasing, so an owner's sentence
 * that happens to begin "Say" or "Your" is not caught: the list below is
 * the templates' (`packages/templates/src/templates/*.ts`), and a template
 * adding a new kind of instruction adds its opening here.
 */
const TEMPLATE_PLACEHOLDER_PATTERNS: RegExp[] = [
    /\bplaceholders?\b/i,
    /^your (first|second|third|fourth|fifth|lead|next|most recent) (project|coach|offer|engagement|piece|class|service)\b/i,
    /^your [^.!?—\n]{1,48} — /i,
    /^your (day rate|monthly rate|usual range)\b/i,
    /^write (a few lines|two or three|a line|a sentence|a paragraph)\b/i,
    /^say (how|what|where|which|whether|who|when|why|a little|plainly)\b/i,
    /^name something you\b/i,
    /^add one of these\b/i,
    /^one sentence on what you\b/i,
];

/** A template's placeholder words in one piece of text, or null. */
function templatePlaceholderIn(value: string): string | null {
    for (const line of value.split(/\n+/)) {
        const t = line.trim();
        if (
            t !== "" &&
            TEMPLATE_PLACEHOLDER_PATTERNS.some((re) => re.test(t))
        ) {
            return t;
        }
    }
    return null;
}

/**
 * The first piece of a block's text still in a template's words. HTML is
 * read as its runs of text between tags, so one placeholder paragraph is
 * found inside a longer text block. A scan of `<` and `>`, not a regex over
 * the markup, so it stays linear (CodeQL js/polynomial-redos).
 */
function templatePlaceholderInAny(values: string[]): string | null {
    for (const value of values) {
        let at = 0;
        for (;;) {
            const open = value.indexOf("<", at);
            const close = open === -1 ? -1 : value.indexOf(">", open + 1);
            const piece =
                open === -1 || close === -1
                    ? value.slice(at)
                    : value.slice(at, open);
            const found = templatePlaceholderIn(piece);
            if (found) return found;
            if (open === -1 || close === -1) break;
            at = close + 1;
        }
    }
    return null;
}

/** Every string inside a value, however deep. */
function stringsOf(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => stringsOf(v, out));
    else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach((v) => stringsOf(v, out));
    }
    return out;
}

/**
 * The fields of the four blocks a template fills with placeholder words,
 * read for the check below. Ids, links, photos and briefs are left out: a
 * photo brief is a note to the owner by design (KTD-5) and never drawn.
 */
const TEMPLATE_TEXT_FIELDS: Record<string, string[]> = {
    person: [
        "name",
        "role",
        "credentials",
        "credentialsLabel",
        "bio",
        "title",
        "people",
    ],
    features: ["heading", "intro", "items", "note"],
    richText: ["value", "callout"],
    projects: ["title", "items"],
};

/** Keys inside those fields that are not text a visitor reads. */
const NOT_VISITOR_TEXT = new Set(["imageBrief", "image", "link", "src", "alt"]);

function visitorText(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(visitorText);
    if (typeof value === "object" && value !== null) {
        return Object.entries(value)
            .filter(([key]) => !NOT_VISITOR_TEXT.has(key))
            .flatMap(([, v]) => visitorText(v));
    }
    return stringsOf(value);
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
    pageIds = new Set<string>(),
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

    /*
     * A block added with its example content (#347 review) that still carries
     * some of it. Named in the merchant's terms, with the words themselves, so
     * the pre-publish check says exactly what to replace. Advisory like every
     * flag here: an example sentence the merchant decides to keep is theirs.
     */
    const example = exampleTextIn(section.type, section.content);
    if (example !== null) {
        const label =
            section.type in BLOCK_META
                ? BLOCK_META[section.type as keyof typeof BLOCK_META].label
                : "block";
        const quoted =
            example.length > 60
                ? `${example.slice(0, 57).trimEnd()}…`
                : example;
        at(
            "placeholderText",
            // "FAQ" stays "FAQ"; "Rich text" reads "rich text" mid-sentence.
            `This ${label === label.toUpperCase() ? label : label.toLowerCase()} still has example text in it ("${quoted}") — replace it with your own before going live.`,
            null,
        );
    }

    /*
     * A template's placeholder words (template polish): an industry
     * template ships the practitioner, the points, the text and the work as
     * words that say what to write ("A placeholder. Say what they coach…").
     * Named with the words themselves, once per block, so the check says
     * exactly what to replace. The text block's own check below already
     * names a "placeholder"; this one is not repeated for it.
     */
    const fields = TEMPLATE_TEXT_FIELDS[section.type] as string[] | undefined;
    if (fields !== undefined && example === null) {
        const found = templatePlaceholderInAny(
            fields.flatMap((key) => visitorText(c[key])),
        );
        const textBlockSaysSo =
            section.type === "richText" &&
            looksLikePlaceholder(textOf(str(c.value)));
        if (found !== null && !textBlockSaysSo) {
            const label =
                section.type in BLOCK_META
                    ? BLOCK_META[
                          section.type as keyof typeof BLOCK_META
                      ].label.toLowerCase()
                    : "block";
            const quoted =
                found.length > 60 ? `${found.slice(0, 57).trimEnd()}…` : found;
            at(
                "placeholderText",
                `This ${label} block still has the template's placeholder words in it ("${quoted}") — replace them with your own before going live.`,
                null,
            );
        }
    }

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

            // A hero is the one section built around an image — except
            // the "No hero" look (U2), which draws none at all.
            const image = obj(c.image);
            if (
                resolveVariant("hero", c) !== "none" &&
                str(image.src).trim() === ""
            ) {
                const brief = str(c.imageBrief).trim();
                at(
                    "missingImage",
                    brief
                        ? `This hero has no image yet. It wants: ${brief}`
                        : "This hero has no image.",
                    "image",
                );
            }

            const cta = obj(c.cta);
            if (Object.keys(cta).length > 0) {
                checkCtaTarget(
                    cta,
                    "cta",
                    "The hero button",
                    at,
                    pagePaths,
                    pageIds,
                    false,
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
            /*
             * The photo beside the text (G7) must be described. The contract
             * lets a save through without it — the merchant picks the photo
             * before describing it, and autosave must not lose it — so this
             * is where it is asked for, before the site goes live.
             */
            const photo = obj(c.image);
            if (str(photo.src).trim() !== "" && str(photo.alt).trim() === "") {
                at(
                    "emptyRequiredField",
                    "The photo in this text section has no description, so someone using a screen reader won't know what it shows.",
                    "image",
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
            checkCtaTarget(
                c,
                "href",
                "This button",
                at,
                pagePaths,
                pageIds,
                true,
            );
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
             * up too small to make out. The look is resolved, not read: v2
             * content names it as `variant`, v1 as `layout`.
             */
            if (
                resolveVariant("gallery", c) === "grid" &&
                images.length === 4
            ) {
                at(
                    "phoneWidth",
                    "Four images in a grid do not stack evenly on a phone.",
                    "images",
                );
            }
            break;
        }

        case "projects": {
            /*
             * Each project's photo must be described (K11), as the text
             * block's is (G7): the contract saves a photo before it is
             * described, so this is where it is asked for. A project's link
             * to a path is checked against the site's pages, as a button's is.
             */
            const items = Array.isArray(c.items) ? c.items : [];
            items.forEach((raw, i) => {
                const item = obj(raw);
                const name = str(item.title).trim();
                const which = name ? `"${name}"` : `project ${i + 1}`;
                const photo = obj(item.image);
                if (
                    str(photo.src).trim() !== "" &&
                    str(photo.alt).trim() === ""
                ) {
                    at(
                        "emptyRequiredField",
                        `The photo for ${which} has no description, so someone using a screen reader won't know what it shows.`,
                        "items",
                    );
                }
                const link = str(item.link).trim();
                if (link !== "" && isBrokenInternalLink(link, pagePaths)) {
                    at(
                        "brokenLink",
                        `The link for ${which} points at ${link}, which is not a page on this site.`,
                        "items",
                    );
                }
            });
            break;
        }

        case "person": {
            // The practitioner's photo must be described (U2), as a
            // project's is: the contract saves it before it is.
            const photo = obj(c.image);
            if (str(photo.src).trim() !== "" && str(photo.alt).trim() === "") {
                at(
                    "emptyRequiredField",
                    "The photo in this person block has no description, so someone using a screen reader won't know what it shows.",
                    "image",
                );
            }
            const cta = obj(c.cta);
            if (Object.keys(cta).length > 0) {
                checkCtaTarget(
                    cta,
                    "cta",
                    "The person block's button",
                    at,
                    pagePaths,
                    pageIds,
                    false,
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
/**
 * Where a button goes, checked per KIND (#207).
 *
 * v1 carried a bare href, and the only thing that could be checked was whether
 * a leading-slash path named a page. v2 names its intent, so each kind gets
 * the check that fits it — a page that is not on the site, a phone number that
 * is not one — and the message names the actual problem instead of "goes
 * nowhere" for everything.
 *
 * `required` is the difference between a standalone button, which is nothing
 * without a target, and a hero's optional one.
 */
function checkCtaTarget(
    cta: Record<string, unknown>,
    field: string,
    subject: string,
    at: (type: FlagType, message: string, field: string | null) => void,
    pagePaths: Set<string>,
    pageIds: Set<string>,
    required: boolean,
): void {
    const action = obj(cta.action);
    const kind = str(action.kind);

    // v1: a bare href.
    if (kind === "") {
        const href = str(cta.href);
        if (href.trim() === "") {
            if (required) {
                at("emptyRequiredField", `${subject} goes nowhere.`, field);
            }
        } else if (isBrokenInternalLink(href, pagePaths)) {
            at(
                "brokenLink",
                `${subject} points at ${href}, which is not a page on this site.`,
                field,
            );
        }
        return;
    }

    switch (kind) {
        case "page": {
            const pageId = str(action.pageId);
            if (pageId === "" || !pageIds.has(pageId)) {
                at(
                    "brokenLink",
                    `${subject} points at a page that is not on this site.`,
                    field,
                );
            }
            return;
        }
        case "url": {
            const href = str(action.href).trim();
            if (href === "") {
                at("emptyRequiredField", `${subject} has no address.`, field);
            } else if (isBrokenInternalLink(href, pagePaths)) {
                at(
                    "brokenLink",
                    `${subject} points at ${href}, which is not a page on this site.`,
                    field,
                );
            } else if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(href)) {
                at(
                    "brokenLink",
                    `${subject} points at "${href}", which is not a web address.`,
                    field,
                );
            }
            return;
        }
        case "email": {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(action.address))) {
                at(
                    "emptyRequiredField",
                    `${subject} has no email address to write to.`,
                    field,
                );
            }
            return;
        }
        case "call":
        case "whatsapp": {
            const digits = str(action.number).replace(/[^0-9]/g, "");
            if (digits.length < 6) {
                at(
                    "emptyRequiredField",
                    `${subject} has no phone number to ${kind === "call" ? "call" : "message"}.`,
                    field,
                );
            }
            return;
        }
        default:
            at(
                "brokenLink",
                `${subject} has an action this site cannot do.`,
                field,
            );
    }
}

function isBrokenInternalLink(href: string, pagePaths: Set<string>): boolean {
    if (!href.startsWith("/")) return false;
    // Compare the path alone: /about#hours and /about are the same page.
    const path = trimTrailingSlashes(href.split(/[?#]/)[0]);
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
    const visible = site.pages.filter((p) => !p.hidden);
    const pagePaths = new Set(visible.map((p) => p.path));
    const pageIds = new Set(visible.map((p) => p.id));

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

    /*
     * The two flags that waited on the navigation model (#206).
     *
     * A menu entry pointing at a hidden page is a link visitors will click
     * into nothing — the exact case the model exists to catch. And a visible
     * page absent from the menu is reachable only by typing its address; the
     * home page is exempt because the site's own name links to it, and a site
     * with no menu at all gets one flag saying so rather than one per page.
     */
    const inMenu = new Set(site.navigation?.items.map((i) => i.pageId) ?? []);
    for (const page of site.pages) {
        if (page.hidden && inMenu.has(page.id)) {
            flags.push({
                type: "hiddenButLinked",
                message: `"${page.title}" is in the menu but hidden, so that link goes nowhere.`,
                pageId: page.id,
                sectionIndex: null,
                field: null,
            });
        }
    }
    /*
     * A page the merchant took out of the menu ("Show in menu" off, G14) is
     * out of it on purpose, and a module page joins the menu on its own, so
     * neither is "not in the menu" by mistake.
     */
    const menuDecided = (page: FlagPageInput) =>
        page.inMenu === false || isModulePageKind(page.kind);
    if (site.navigation) {
        for (const page of visible) {
            if (
                page.path !== "/" &&
                !inMenu.has(page.id) &&
                !menuDecided(page)
            ) {
                flags.push({
                    type: "pageNotInNavigation",
                    message: `"${page.title}" is not in the menu, so visitors can only reach it by typing its address.`,
                    pageId: page.id,
                    sectionIndex: null,
                    field: null,
                });
            }
        }
    } else if (
        visible.filter((p) => p.path !== "/" && !menuDecided(p)).length > 0
    ) {
        flags.push({
            type: "pageNotInNavigation",
            message:
                "This site has no menu yet, so visitors can only reach its other pages by typing their addresses.",
            pageId: null,
            sectionIndex: null,
            field: null,
        });
    }

    /*
     * A free-form page at an address a route owns (G14): /book and what is
     * under it, /checkout and what is under it. The route answers there, so
     * visitors never see the page; it is flagged, never moved, so the
     * merchant picks its new address. (A page at /shop is the shop's
     * question, `checkShop`: it is still served there.)
     */
    for (const page of visible) {
        const reserved = reservedPathFor(page.path);
        if (!reserved || reserved.root === SHOP_ROOT) continue;
        if (!reservedAgainst(page.path, (page.kind ?? "FREE") as PageKind)) {
            continue;
        }
        flags.push({
            type: "reservedAddress",
            message: `This page can't be seen: ${reserved.root} is ${reserved.purpose}. Change its path so visitors can reach it.`,
            pageId: page.id,
            sectionIndex: null,
            field: "path",
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
            flags.push(
                ...checkSection(page, index, section, pagePaths, pageIds),
            );
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

// ---------------------------------------------------------------------------
// The shop (G11)
// ---------------------------------------------------------------------------

/** What the shop's two checks need; the caller asks only while it is open. */
export interface ShopFlagInput {
    /** The site sells from an open storefront. */
    storefrontChosen: boolean;
    /** Open storefronts that list a published product. */
    candidates: number;
    /** The site's pages, to find one at the shop's address. */
    pages: { id: string; path: string; hidden: boolean; kind?: string }[];
    /** Whether a path is the shop's address or under it. */
    isShopPath: (path: string) => boolean;
    /**
     * Why the chosen storefront can't take an order at the site's checkout
     * now (G13), or null when it can (or none is chosen).
     */
    cantTakeOrders?: {
        reason: "paused" | "no-provider";
        message: string;
    } | null;
}

/**
 * The shop's pre-publish flags (G11).
 *
 * - No storefront chosen while there is one to choose: `/shop`, the Product
 *   grid and checkout render nothing live until it is answered.
 * - A page at `/shop` (or under it): it keeps being served there, so nothing
 *   live disappears, but the shop can't open at its address until the page
 *   moves. The flag sits on that page and asks for a new address.
 */
export function checkShop(input: ShopFlagInput): Flag[] {
    const flags: Flag[] = [];
    if (!input.storefrontChosen && input.candidates > 0) {
        flags.push({
            type: "storefrontUnchosen",
            message:
                "Pick which location your online shop sells from. Until you do, the shop and its products don't show on the site.",
            pageId: null,
            sectionIndex: null,
            field: "storefrontId",
        });
    }
    if (input.storefrontChosen && input.cantTakeOrders) {
        flags.push({
            type: "shopCantTakeOrders",
            message: input.cantTakeOrders.message,
            pageId: null,
            sectionIndex: null,
            field: null,
        });
    }
    for (const page of input.pages) {
        if (page.hidden || !input.isShopPath(page.path)) continue;
        // The Shop page (G14) is the shop's own, at its own address.
        if (page.kind === "SHOP" && page.path === SHOP_ROOT) continue;
        flags.push({
            type: "reservedAddress",
            message: `${page.path} is where your online shop lives. This page keeps showing there for now. Change its path so the shop can open.`,
            pageId: page.id,
            sectionIndex: null,
            field: "path",
        });
    }
    return flags;
}

// ---------------------------------------------------------------------------
// The web address (DEC-069, L5)
// ---------------------------------------------------------------------------

/** What the address flag says; `publishSite`'s refusal says the same. */
export const ADDRESS_MISSING_MESSAGE =
    "Choose a web address before publishing. Without one, nobody can reach this site.";

/**
 * A site made before every site had an address (L5) can still have none. It
 * is never given one silently — the owner chooses, in Settings › Business —
 * and until then publishing is refused. This is the flag that says why.
 */
export function checkAddress(subdomain: string | null): Flag[] {
    if (subdomain) return [];
    return [
        {
            type: "addressMissing",
            message: ADDRESS_MISSING_MESSAGE,
            pageId: null,
            sectionIndex: null,
            field: "subdomain",
            blocking: true,
        },
    ];
}
