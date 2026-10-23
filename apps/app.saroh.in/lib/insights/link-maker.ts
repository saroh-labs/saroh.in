import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

/**
 * The links a business makes in Saroh to share its site (DEC-181, #1099),
 * on Insights › Where customers come from: a name the team reads ("Diwali
 * post"), a label the link carries (`diwali-post`) and the link itself,
 * `https://<site's address>/?ref=<label>`. Only these labels are counted as
 * themselves; any other link counts under where it was shared.
 *
 * Pure, so the maker and the list are tested apart from the screen. The
 * label's rules mirror the API's (`analytics/site-links.ts`,
 * `analytics/visit-source.ts`), so a label the API would refuse is said
 * under its field before anything is sent.
 */

/** The longest name, as the API takes it. */
export const LINK_NAME_MAX = 80;

/** The longest label. */
export const LINK_LABEL_MAX = 32;

/** No more digits than this in a label: a phone number is never one. */
const LABEL_MAX_DIGITS = 6;

const LABEL_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const DIGIT_RUN = /\d{6,}/;
const ID_SHAPE = /^c[a-z0-9]{24}$/;

/** Words the site reads as where a visit came from, never a label. */
const GROUP_WORDS: ReadonlySet<string> = new Set([
    "instagram",
    "insta",
    "ig",
    "google",
    "whatsapp",
    "wa",
]);

/** The words under the name field. */
export const NAME_HINT = "Name the post, not the person.";

/**
 * A label made from the name: lower case, accents dropped, each run of
 * anything else one hyphen, cut at a hyphen within 32. "Diwali post!" →
 * "diwali-post".
 */
export function linkLabelOf(name: string): string {
    const slug = name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (slug.length <= LINK_LABEL_MAX) return slug;
    const cut = slug.slice(0, LINK_LABEL_MAX);
    const lastHyphen = cut.lastIndexOf("-");
    return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

/**
 * A label as it is typed: lower case, spaces as hyphens. The rest is
 * checked, never quietly changed.
 */
export function typedLabel(value: string): string {
    return value.toLowerCase().replace(/\s+/g, "-");
}

/** What is wrong with a label, in words, or null when it can be one. */
export function labelProblem(label: string): string | null {
    const value = label.trim();
    if (value === "") return "Give the link a label.";
    if (
        value.length > LINK_LABEL_MAX ||
        !LABEL_SHAPE.test(value) ||
        DIGIT_RUN.test(value) ||
        (value.match(/\d/g)?.length ?? 0) > LABEL_MAX_DIGITS ||
        ID_SHAPE.test(value)
    ) {
        return "Use lower-case letters, numbers and hyphens, up to 32, and no more than 6 numbers.";
    }
    if (GROUP_WORDS.has(value)) {
        return "That word already means a place a visit comes from. Choose another label.";
    }
    return null;
}

/** What is wrong with a name, or null. */
export function nameProblem(name: string): string | null {
    const value = name.trim();
    if (value === "") return "Name the link.";
    if (value.length > LINK_NAME_MAX) {
        return `Keep the name to ${LINK_NAME_MAX} characters.`;
    }
    return null;
}

/**
 * The link to share: the site's own address (its custom domain when it
 * has one, from `lib/sites/share-links.ts` `siteAddressOf`) with the
 * label. Null when the site has no address yet.
 */
export function linkUrl(siteUrl: string | null, label: string): string | null {
    if (!siteUrl) return null;
    return `${siteUrl.replace(/\/+$/, "")}/?ref=${encodeURIComponent(label)}`;
}

/** One link as the list reads it (`GET …/analytics/links`). */
export interface SiteLinkRead {
    id: string;
    siteId: string;
    name: string;
    label: string;
    createdAt: string;
    visits: number | null;
    paid: number | null;
    few: boolean;
}

export interface SiteLinksRead {
    links: SiteLinkRead[];
    minVisits: number;
}

/**
 * A link's figures in the period: "12 visits · 2 paid", or, under the
 * fewest a label is shown with, "Fewer than 3 visits", as the sources
 * table folds those into Other links.
 */
export function linkFigures(link: SiteLinkRead, minVisits: number): string {
    if (link.few || link.visits === null) {
        return `Fewer than ${formatNumber(minVisits)} visits`;
    }
    return `${count(link.visits, "visit")} · ${formatNumber(link.paid ?? 0)} paid`;
}
