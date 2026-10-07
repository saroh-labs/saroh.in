/**
 * What a section carries about its place on the page, beside its own content
 * (industry templates, polish pass): a stable `anchor` the page can link to,
 * a `navLabel` that lists it in the site's header, and a `band` behind it.
 *
 * EVERY block carries these, so they are not written into each block's
 * schema (twenty copies of three lines, and a block added later without them
 * would quietly strip them on save). `parseSectionContent` reads them off the
 * content beside the block's own schema and puts them back on what it
 * returns. Like `padding` they live inside `content` — the one free-form
 * field a section row has — so a section that sets none of them is byte for
 * byte what it was, and an older renderer simply ignores them.
 *
 * The renderer reads them with {@link sectionFrameOf}, which re-checks each
 * one, because the anchor becomes an element id and part of a link.
 */

/**
 * The bands a section can sit on. `none` is today's: the page ground. The
 * others recolour the section's own `--site-*` tokens (`SiteTheme`):
 * `surface` the palette's card colour; `inverse` the page's ink and paper
 * swapped; `accent` the accent with its own text colour. Each keeps a text
 * pairing the palette already holds to 4.5:1.
 */
export const SECTION_BANDS = ["none", "surface", "inverse", "accent"] as const;
export type SectionBand = (typeof SECTION_BANDS)[number];

/** The longest anchor: a word or three, never a sentence. */
export const ANCHOR_MAX = 40;
/** The longest menu label: a header entry, not a heading. */
export const NAV_LABEL_MAX = 30;
/** How many sections one page may list in the header. */
export const IN_PAGE_NAV_MAX = 8;

/** Lower-case words joined by single dashes, starting with a letter. */
const ANCHOR_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Ids the site's own parts use (the enquiry form's `#enquiry`, the page's
 * main landmark) and the prefixes kept for them, so an anchor never names a
 * second element with the same id.
 */
const RESERVED_ANCHORS = new Set(["main", "top", "content", "enquiry"]);
const RESERVED_PREFIXES = ["site-", "saroh-"];

/** What a section's frame may hold, as stored. `band: "none"` is absent. */
export interface SectionFrame {
    anchor?: string;
    navLabel?: string;
    band?: Exclude<SectionBand, "none">;
}

export interface SectionFrameIssue {
    path: [keyof SectionFrame];
    message: string;
}

export type SectionFrameResult =
    | { ok: true; frame: SectionFrame }
    | { ok: false; issues: SectionFrameIssue[] };

/** Why an anchor cannot be used, or null when it can. */
export function anchorProblem(anchor: string): string | null {
    if (anchor.length > ANCHOR_MAX) {
        return `A link name can be at most ${ANCHOR_MAX} characters`;
    }
    if (!ANCHOR_RE.test(anchor)) {
        return "A link name is lower-case words joined by dashes, starting with a letter";
    }
    if (
        RESERVED_ANCHORS.has(anchor) ||
        RESERVED_PREFIXES.some((prefix) => anchor.startsWith(prefix))
    ) {
        return `"${anchor}" is used by the site itself; choose another link name`;
    }
    return null;
}

/**
 * Read and check a section's frame from its raw content. Refuses rather than
 * drops: a template or an editor that sent a bad anchor has a bug worth a
 * message. Blank values count as absent, and `band: "none"` is stored as no
 * band, so "none" and "never set" are one look and one stored value.
 */
export function parseSectionFrame(content: unknown): SectionFrameResult {
    if (content === null || typeof content !== "object") {
        return { ok: true, frame: {} };
    }
    const raw = content as Record<string, unknown>;
    const issues: SectionFrameIssue[] = [];
    const frame: SectionFrame = {};

    const text = (field: keyof SectionFrame): string | undefined => {
        const value = raw[field];
        if (value === undefined || value === null) return undefined;
        if (typeof value !== "string") {
            issues.push({ path: [field], message: `${field} must be text` });
            return undefined;
        }
        return value.trim() === "" ? undefined : value.trim();
    };

    const anchor = text("anchor");
    if (anchor !== undefined) {
        const problem = anchorProblem(anchor);
        if (problem) issues.push({ path: ["anchor"], message: problem });
        else frame.anchor = anchor;
    }

    const navLabel = text("navLabel");
    if (navLabel !== undefined) {
        if (navLabel.length > NAV_LABEL_MAX) {
            issues.push({
                path: ["navLabel"],
                message: `A menu label can be at most ${NAV_LABEL_MAX} characters`,
            });
        } else if (anchor === undefined) {
            issues.push({
                path: ["navLabel"],
                message:
                    "A section in the menu needs a link name for the menu to jump to",
            });
        } else {
            frame.navLabel = navLabel;
        }
    }

    const band = raw.band;
    if (band !== undefined && band !== null) {
        if (!(SECTION_BANDS as readonly unknown[]).includes(band)) {
            issues.push({
                path: ["band"],
                message: `band must be one of ${SECTION_BANDS.join(", ")}`,
            });
        } else if (band !== "none") {
            frame.band = band as SectionFrame["band"];
        }
    }

    return issues.length > 0 ? { ok: false, issues } : { ok: true, frame };
}

/**
 * A section's frame as the renderer may use it: each field re-checked and
 * dropped when it fails, never thrown. The content is a published snapshot,
 * validated at publish, but the anchor becomes an element id and a link, so
 * it is checked again rather than trusted.
 */
export function sectionFrameOf(content: unknown): SectionFrame {
    if (content === null || typeof content !== "object") return {};
    const raw = content as Record<string, unknown>;
    const frame: SectionFrame = {};
    if (typeof raw.anchor === "string" && anchorProblem(raw.anchor) === null) {
        frame.anchor = raw.anchor;
    }
    if (
        typeof raw.navLabel === "string" &&
        raw.navLabel.trim() !== "" &&
        raw.navLabel.length <= NAV_LABEL_MAX
    ) {
        frame.navLabel = raw.navLabel.trim();
    }
    if (
        typeof raw.band === "string" &&
        raw.band !== "none" &&
        (SECTION_BANDS as readonly string[]).includes(raw.band)
    ) {
        frame.band = raw.band as SectionFrame["band"];
    }
    return frame;
}

/**
 * The first section that repeats an anchor an earlier section on its page
 * already uses, or null. An anchor is an element id, so it must be unique on
 * its page; the API refuses a save (and a template its instantiation) that
 * repeats one, pointing at the block that does.
 */
export function repeatedAnchor(
    sections: readonly { content: unknown }[],
): { index: number; anchor: string } | null {
    const seen = new Set<string>();
    for (let index = 0; index < sections.length; index++) {
        const anchor = sectionFrameOf(sections[index].content).anchor;
        if (anchor === undefined) continue;
        if (seen.has(anchor)) return { index, anchor };
        seen.add(anchor);
    }
    return null;
}

/** A header entry that jumps to a section of the home page. */
export interface InPageNavItem {
    label: string;
    /** `/#anchor`: from the home page it scrolls, from any other it goes. */
    href: string;
}

/**
 * The header entries a page's sections ask for: each section with an anchor
 * and a menu label, in page order, the first {@link IN_PAGE_NAV_MAX}. Only
 * the home page's sections are listed (the publisher passes them), so the
 * entries work from every page as `/#anchor`.
 */
export function inPageNavigation(
    sections: readonly { content: unknown }[],
): InPageNavItem[] {
    const items: InPageNavItem[] = [];
    const seen = new Set<string>();
    for (const section of sections) {
        const { anchor, navLabel } = sectionFrameOf(section.content);
        if (!anchor || !navLabel || seen.has(anchor)) continue;
        seen.add(anchor);
        items.push({ label: navLabel, href: `/#${anchor}` });
        if (items.length === IN_PAGE_NAV_MAX) break;
    }
    return items;
}

/** A menu entry, as the merge below needs it. */
export interface MenuEntry {
    label: string;
    href: string;
    /** The module page it opens, when it opens one (G14). */
    kind?: string;
}

/** An entry that jumps to a section of the home page (`/#visit`). */
export function isInPageHref(href: string): boolean {
    return href.startsWith("/#");
}

/** Two menu labels read as one entry: trimmed, case ignored. */
export function sameMenuLabel(a: string, b: string): boolean {
    return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * The menu with the home page's sections in front, less any section entry
 * a page entry already names.
 *
 * A template can have both a Timetable page and a Timetable section on the
 * home page; listing both reads "Timetable · … · Timetable". The PAGE entry
 * stays — it is the fuller version — and the section's goes. Otherwise the
 * order is kept: the remaining section entries, then the page entries, less
 * any page entry whose address a section entry already is.
 *
 * `shadowsOnlyAlways`: a module page's entry (one with a `kind`) can leave
 * the menu at view time while its module is off (G19). Publish passes true,
 * so only an entry that is always there takes a section's place; the header
 * then drops a section entry a module page still shadows when it draws
 * ({@link withoutShadowedInPageEntries}).
 */
export function mergeInPageNavigation<T extends MenuEntry>(
    inPage: readonly InPageNavItem[],
    menu: readonly T[],
    { shadowsOnlyAlways = false }: { shadowsOnlyAlways?: boolean } = {},
): (T | InPageNavItem)[] {
    const shadowing = menu.filter(
        (item) => !isInPageHref(item.href) && !(shadowsOnlyAlways && item.kind),
    );
    const kept = inPage.filter(
        (item) =>
            !shadowing.some((page) => sameMenuLabel(page.label, item.label)),
    );
    const taken = new Set(kept.map((item) => item.href));
    return [...kept, ...menu.filter((item) => !taken.has(item.href))];
}

/**
 * The menu as drawn, less each section entry (`/#…`) whose label a page
 * entry in the same menu also has — the rule of
 * {@link mergeInPageNavigation}, applied to a menu already merged. The header
 * runs it after the modules that are off have left the menu, so a section
 * entry stands in for its module page only while that page is out.
 */
export function withoutShadowedInPageEntries<T extends MenuEntry>(
    menu: readonly T[],
): T[] {
    const pages = menu.filter((item) => !isInPageHref(item.href));
    return menu.filter(
        (item) =>
            !isInPageHref(item.href) ||
            !pages.some((page) => sameMenuLabel(page.label, item.label)),
    );
}

/**
 * A link name from a menu label ("Today's bread" → `todays-bread`), for the
 * editor to suggest when a section is given a label first. May still need a
 * change if it is reserved or taken; {@link anchorProblem} says so.
 */
export function anchorFromLabel(label: string): string {
    const words = label
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ']/g, "")
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    let anchor = words.join("-");
    // Starts with a letter: "24 hours" becomes "section-24-hours".
    if (anchor !== "" && !/^[a-z]/.test(anchor)) anchor = `section-${anchor}`;
    return anchor.slice(0, ANCHOR_MAX).replace(/-+$/, "");
}
