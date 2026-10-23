import { VISIT_REF_MAX, visitRefOf } from "./visit-source";

/**
 * The links a business makes in Saroh to share its site (DEC-181, #1099):
 * `https://<site address>/?ref=<label>`, named for the team ("Diwali
 * post"). Only these labels are counted on Insights › Where customers come
 * from; any other `ref` a visit carries counts under its group alone.
 *
 * Pure: the label rules, so the API and the screen agree and are tested
 * without a database. The app mirrors {@link linkLabelOf} to propose a
 * label as the name is typed (`apps/app.saroh.in/lib/insights/link-maker.ts`).
 */

/** The longest name the team gives a link. */
export const LINK_NAME_MAX = 80;

/** How many live links one site holds. A bound on the table, not a plan limit. */
export const LINKS_PER_SITE_MAX = 200;

/**
 * Words the site reads as a group, never a label (`?ref=instagram` is
 * Instagram, `site-blocks/visit-source.ts` `LABEL_GROUPS`): a link with one
 * of these as its label would never be counted as itself.
 */
export const GROUP_WORDS: ReadonlySet<string> = new Set([
    "instagram",
    "insta",
    "ig",
    "google",
    "whatsapp",
    "wa",
]);

/** Why a label can't be a link's. */
export type LinkLabelProblem = "empty" | "shape" | "group-word";

/**
 * A label proposed from the link's name: lower case, accents dropped, each
 * run of anything else one hyphen, cut to the longest label at a hyphen
 * where it can be. "Diwali post!" → "diwali-post". Empty when nothing is
 * left; the result still has to pass {@link linkLabelProblem} (a name that
 * is a phone number makes no label).
 */
export function linkLabelOf(name: string): string {
    const slug = name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (slug.length <= VISIT_REF_MAX) return slug;
    const cut = slug.slice(0, VISIT_REF_MAX);
    const lastHyphen = cut.lastIndexOf("-");
    return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

/**
 * What is wrong with a label, or null when it can be a link's: the shape
 * every counted label has (`visitRefOf`: lower-case letters, digits and
 * hyphens, no record id, under seven digits), and not a group's word.
 */
export function linkLabelProblem(label: string): LinkLabelProblem | null {
    if (label.trim() === "") return "empty";
    // Exactly as typed: `visitRefOf` would lower-case it, and a label is
    // kept as the link carries it.
    if (visitRefOf(label) !== label) return "shape";
    if (GROUP_WORDS.has(label)) return "group-word";
    return null;
}

/**
 * The label to save when the one asked for is taken on the site: the
 * first of `label-2`, `label-3`… that is free and still a label, else null.
 */
export function freeLinkLabel(
    label: string,
    taken: ReadonlySet<string>,
): string | null {
    if (!taken.has(label)) return label;
    for (let n = 2; n < 100; n++) {
        const tail = `-${n}`;
        const base = label
            .slice(0, VISIT_REF_MAX - tail.length)
            .replace(/-+$/, "");
        const next = `${base}${tail}`;
        if (!taken.has(next) && linkLabelProblem(next) === null) return next;
    }
    return null;
}
