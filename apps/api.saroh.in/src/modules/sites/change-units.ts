import { createHash } from "node:crypto";

import type { SectionType } from "@saroh/block-contract";
import { blockHeading, SECTION_TYPES } from "@saroh/block-contract";

import type { SiteChangeKind } from "./pending-changes";
import { canonical, pendingSiteChanges } from "./pending-changes";

/**
 * What publishing would change, one thing at a time, and who changed each
 * (change units, website area plan 2026-11-18-001 U7, KTD-4).
 *
 * A unit is the smallest thing the Publish sheet can name, leave out (U8) or
 * approve (U9). Its key is stable while the thing it names exists:
 *
 * - `section:<pageId>:<sectionKey>`: one section on a page. A live section
 *   from a snapshot written before snapshots carried keys has no key of its
 *   own; it is `section:<pageId>:@<index>` (its place on the live page).
 * - `page:<pageId>`: one page's settings (link, title, Google text, share
 *   image, Show on Google) and the old links that forward to it. A live page
 *   from such a snapshot that no draft page matches is `page:@<path>`.
 * - `site:<kind>`: one site setting, a `SITE_CHANGE_KINDS` kind other than
 *   `pages` and `redirects` (those are per page here).
 *
 * Pure: the caller loads the draft snapshot (built by `buildSnapshot`, so it
 * carries `keys`), the live snapshot and the stamps.
 */

/** Who last changed something, and when (ISO). */
export interface ChangeStamp {
    userId: string;
    at: string;
}

export type ChangeUnitKind = "section" | "page" | "site";
export type ChangeUnitChange =
    "added" | "changed" | "moved" | "removed" | "hidden";

export interface ChangeUnit {
    key: string;
    kind: ChangeUnitKind;
    change: ChangeUnitChange;
    /** In the merchant's words: "Changed · Top of the page". */
    label: string;
    /** Where it is: the page's title, or "Every page" for a site setting. */
    where: string;
    pageId: string | null;
    /** Changes when what this unit would publish changes (U9 binds to it). */
    fingerprint: string;
    /** Null: changed before attribution, shown under "Earlier changes". */
    editedBy: string | null;
    editedAt: string | null;
    /** Units that go out (or are left out) with this one: a new page's
     * sections need the page. */
    requires: string[];
}

/** The stamps a draft holds, as the service loads them. */
export interface ChangeStamps {
    /** `<pageId>:<sectionKey>` for every draft section, hidden ones too. */
    sections: ReadonlyMap<
        string,
        { stamp: ChangeStamp | null; hidden: boolean }
    >;
    /** Every draft page, hidden ones too: its settings stamp. */
    pages: ReadonlyMap<
        string,
        { stamp: ChangeStamp | null; hidden: boolean; title: string }
    >;
    /** Old links not removed, by the link they forward from. */
    redirects: ReadonlyMap<string, ChangeStamp | null>;
    /** `Site.draftEditors`, by unit key. */
    draftEditors: Readonly<Partial<Record<string, ChangeStamp>>>;
}

/** The ids a snapshot carries beside its pages: `keys[path]`. */
export type SnapshotKeys = Record<string, { id: string; sections: string[] }>;

const PAGE_FIELDS = [
    "path",
    "title",
    "isHome",
    "kind",
    "seoTitle",
    "seoDescription",
    "shareImageUrl",
    "noindex",
] as const;

/** Site settings in the merchant's words (RULES §1). */
const SITE_WORDS: Record<
    Exclude<SiteChangeKind, "pages" | "redirects">,
    string
> = {
    name: "Site name",
    search: "Google text for the site",
    shareImage: "Share image",
    icon: "Tab icon",
    posts: "Blog page link",
    style: "Look and colours",
    footer: "Footer",
    menu: "Menu",
};

const VERB: Record<ChangeUnitChange, string> = {
    added: "Added",
    changed: "Changed",
    moved: "Moved",
    removed: "Removed",
    hidden: "Hidden",
};

/** RULES §1 words over the catalogue's own where they differ. */
const SECTION_WORDS: Partial<Record<string, string>> = {
    hero: "Top of the page",
};

interface SnapshotPage {
    path: string;
    title: string;
    entry: Record<string, unknown>;
    sections: unknown[];
    id: string | null;
    /** Null when the snapshot has none, or they don't match the sections. */
    keys: string[] | null;
}

interface SnapshotRedirect {
    from: string;
    to: string;
}

function asObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

/** A snapshot's pages with their ids and section keys; forgiving of old ones. */
function readPages(snapshot: unknown): SnapshotPage[] {
    const shape = asObject(snapshot);
    const keys = asObject(shape.keys);
    const pages = Array.isArray(shape.pages) ? shape.pages : [];
    const out: SnapshotPage[] = [];
    for (const raw of pages) {
        const entry = asObject(raw);
        if (typeof entry.path !== "string") continue;
        const sections = Array.isArray(entry.sections) ? entry.sections : [];
        const own = asObject(keys[entry.path]);
        const sectionKeys =
            Array.isArray(own.sections) &&
            own.sections.length === sections.length &&
            own.sections.every((k) => typeof k === "string")
                ? own.sections
                : null;
        out.push({
            path: entry.path,
            title: typeof entry.title === "string" ? entry.title : entry.path,
            entry,
            sections,
            id: typeof own.id === "string" ? own.id : null,
            keys: sectionKeys,
        });
    }
    return out;
}

function readRedirects(snapshot: unknown): SnapshotRedirect[] {
    const list = asObject(snapshot).redirects;
    if (!Array.isArray(list)) return [];
    return list
        .map(asObject)
        .filter(
            (r): r is { from: string; to: string } =>
                typeof r.from === "string" && typeof r.to === "string",
        )
        .map((r) => ({ from: r.from, to: r.to }));
}

/** What a page's settings unit compares: the page entry minus its sections. */
function pageSettings(entry: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of PAGE_FIELDS) out[field] = entry[field] ?? null;
    return out;
}

function fingerprint(value: unknown): string {
    return createHash("sha256").update(canonical(value)).digest("hex");
}

/** A section's name: its own heading where it has one, else the block's. */
export function sectionLabel(section: unknown): string {
    const s = asObject(section);
    const type = typeof s.type === "string" ? s.type : "";
    const own = SECTION_WORDS[type];
    if (own) return own;
    const content = asObject(s.content);
    for (const field of ["heading", "title"]) {
        const value = content[field];
        if (typeof value === "string" && value.trim()) {
            const text = value.trim();
            return text.length > 60 ? `${text.slice(0, 59)}…` : text;
        }
    }
    return (SECTION_TYPES as readonly string[]).includes(type)
        ? blockHeading(type as SectionType)
        : "Section";
}

/**
 * The keys of `a` that keep their order relative to each other in `b`
 * (a longest common subsequence). Both hold the same keys. A section outside
 * it moved; one inside only had neighbours move around it.
 */
function inPlace(a: readonly string[], b: readonly string[]): Set<string> {
    const n = a.length;
    const m = b.length;
    const len: number[][] = Array.from({ length: n + 1 }, () =>
        new Array<number>(m + 1).fill(0),
    );
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            len[i][j] =
                a[i] === b[j]
                    ? len[i + 1][j + 1] + 1
                    : Math.max(len[i + 1][j], len[i][j + 1]);
        }
    }
    const kept = new Set<string>();
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            kept.add(a[i]);
            i += 1;
            j += 1;
        } else if (len[i + 1][j] >= len[i][j + 1]) i += 1;
        else j += 1;
    }
    return kept;
}

function newest(
    stamps: (ChangeStamp | null | undefined)[],
): ChangeStamp | null {
    let best: ChangeStamp | null = null;
    for (const s of stamps) if (s && (!best || s.at > best.at)) best = s;
    return best;
}

/**
 * Every change unit between a draft snapshot and the live one. Null `live`
 * (never published) is not handled here: there is nothing to diff against.
 */
export function changeUnits(
    draft: unknown,
    live: unknown,
    stamps: ChangeStamps,
): ChangeUnit[] {
    const units: ChangeUnit[] = [];
    const draftPages = readPages(draft);
    const livePages = readPages(live);
    const draftRedirects = readRedirects(draft);
    const liveRedirects = readRedirects(live);
    // Live pages written with ids match by id; older ones by link.
    const liveHasIds = livePages.some((p) => p.id !== null);
    const matched = new Set<SnapshotPage>();

    const unit = (
        u: Omit<ChangeUnit, "editedBy" | "editedAt" | "fingerprint"> & {
            stamp: ChangeStamp | null | undefined;
            value: unknown;
        },
    ) => {
        const { stamp, value, ...rest } = u;
        units.push({
            ...rest,
            fingerprint: fingerprint({ change: rest.change, value }),
            editedBy: stamp?.userId ?? null,
            editedAt: stamp?.at ?? null,
        });
    };

    const redirectsTo = (list: SnapshotRedirect[], path: string) =>
        list
            .filter((r) => r.to === path)
            .map((r) => r.from)
            .sort();

    for (const d of draftPages) {
        // Built by `buildSnapshot`, a draft page always has its id.
        const pageId = d.id ?? `@${d.path}`;
        const pageKey = `page:${pageId}`;
        const pageStamp = d.id ? stamps.pages.get(d.id) : undefined;
        const l = livePages.find((p) =>
            liveHasIds ? p.id === d.id : p.path === d.path,
        );
        if (l) matched.add(l);
        const draftKeys = d.keys ?? d.sections.map((_, i) => `@${i}`);
        const sectionStamp = (key: string) =>
            stamps.sections.get(`${pageId}:${key}`)?.stamp ??
            // A section nobody stamped on a page made since: its maker's.
            (l ? null : pageStamp?.stamp);

        if (!l) {
            unit({
                key: pageKey,
                kind: "page",
                change: "added",
                label: "New page",
                where: d.title,
                pageId: d.id,
                requires: [],
                stamp: pageStamp?.stamp,
                value: {
                    page: pageSettings(d.entry),
                    redirects: redirectsTo(draftRedirects, d.path),
                },
            });
            d.sections.forEach((section, i) => {
                const key = draftKeys[i];
                unit({
                    key: `section:${pageId}:${key}`,
                    kind: "section",
                    change: "added",
                    label: `Added · ${sectionLabel(section)}`,
                    where: d.title,
                    pageId: d.id,
                    requires: [pageKey],
                    stamp: sectionStamp(key),
                    value: section,
                });
            });
            continue;
        }

        // The page's settings and the old links that forward to it: an old
        // link follows its page's unit (KTD-3), so leaving out a rename also
        // leaves out the forward it made.
        const draftSettings = pageSettings(d.entry);
        const liveSettings = pageSettings(l.entry);
        const draftLinks = redirectsTo(draftRedirects, d.path);
        const liveLinks = redirectsTo(liveRedirects, l.path);
        const settingsChanged =
            canonical(draftSettings) !== canonical(liveSettings);
        const linksChanged = canonical(draftLinks) !== canonical(liveLinks);
        if (settingsChanged || linksChanged) {
            const newLinks = draftLinks.filter((f) => !liveLinks.includes(f));
            unit({
                key: pageKey,
                kind: "page",
                change: "changed",
                label: !settingsChanged
                    ? "Old links that forward"
                    : draftSettings.path !== liveSettings.path
                      ? "Page link changed"
                      : "Page settings changed",
                where: d.title,
                pageId: d.id,
                requires: [],
                stamp: settingsChanged
                    ? pageStamp?.stamp
                    : (newest(newLinks.map((f) => stamps.redirects.get(f))) ??
                      pageStamp?.stamp),
                value: { page: draftSettings, redirects: draftLinks },
            });
        }

        const section = (
            key: string,
            change: ChangeUnitChange,
            value: unknown,
            stamp: ChangeStamp | null | undefined,
        ) =>
            unit({
                key: `section:${pageId}:${key}`,
                kind: "section",
                change,
                label: `${VERB[change]} · ${sectionLabel(value)}`,
                where: d.title,
                pageId: d.id,
                requires: [],
                stamp,
                value,
            });

        if (l.keys) {
            const liveByKey = new Map(
                l.keys.map((k, i) => [k, l.sections[i]] as const),
            );
            const draftSet = new Set(draftKeys);
            const kept = inPlace(
                draftKeys.filter((k) => liveByKey.has(k)),
                l.keys.filter((k) => draftSet.has(k)),
            );
            draftKeys.forEach((key, i) => {
                const next = d.sections[i];
                if (!liveByKey.has(key)) {
                    section(key, "added", next, sectionStamp(key));
                } else if (canonical(next) !== canonical(liveByKey.get(key))) {
                    section(key, "changed", next, sectionStamp(key));
                } else if (!kept.has(key)) {
                    section(key, "moved", next, sectionStamp(key));
                }
            });
            for (const [key, previous] of liveByKey) {
                if (draftSet.has(key)) continue;
                const row = stamps.sections.get(`${pageId}:${key}`);
                section(
                    key,
                    row?.hidden ? "hidden" : "removed",
                    previous,
                    row?.hidden
                        ? row.stamp
                        : stamps.draftEditors[`section:${pageId}:${key}`],
                );
            }
        } else {
            // A live page from before keys: by place, as the count always was.
            const shared = Math.min(d.sections.length, l.sections.length);
            for (let i = 0; i < d.sections.length; i += 1) {
                const key = draftKeys[i];
                if (i >= shared) {
                    section(key, "added", d.sections[i], sectionStamp(key));
                } else if (
                    canonical(d.sections[i]) !== canonical(l.sections[i])
                ) {
                    section(key, "changed", d.sections[i], sectionStamp(key));
                }
            }
            for (let i = shared; i < l.sections.length; i += 1) {
                section(`@${i}`, "removed", l.sections[i], null);
            }
        }
    }

    // Live pages the draft no longer serves: deleted or hidden.
    for (const l of livePages) {
        if (matched.has(l)) continue;
        const pageId = l.id ?? `@${l.path}`;
        const pageKey = `page:${pageId}`;
        const row = l.id ? stamps.pages.get(l.id) : undefined;
        const hidden = row?.hidden === true;
        const pageStamp = row?.hidden
            ? row.stamp
            : stamps.draftEditors[pageKey];
        unit({
            key: pageKey,
            kind: "page",
            change: hidden ? "hidden" : "removed",
            label: hidden ? "Page hidden" : "Page removed",
            where: l.title,
            pageId: l.id,
            requires: [],
            stamp: pageStamp,
            value: { path: l.path },
        });
        l.sections.forEach((previous, i) => {
            const key = l.keys?.[i] ?? `@${i}`;
            unit({
                key: `section:${pageId}:${key}`,
                kind: "section",
                change: hidden ? "hidden" : "removed",
                label: `${VERB[hidden ? "hidden" : "removed"]} · ${sectionLabel(previous)}`,
                where: l.title,
                pageId: l.id,
                requires: [pageKey],
                stamp: pageStamp,
                value: previous,
            });
        });
    }

    // Site settings, as the existing count names them.
    const draftShape = asObject(draft);
    const kinds = pendingSiteChanges(
        asObject(draftShape.site),
        [],
        live,
        [],
    ).filter(
        (k): k is Exclude<SiteChangeKind, "pages" | "redirects"> =>
            k !== "pages" && k !== "redirects",
    );
    for (const kind of kinds) {
        unit({
            key: `site:${kind}`,
            kind: "site",
            change: "changed",
            label: `Changed · ${SITE_WORDS[kind]}`,
            where: "Every page",
            pageId: null,
            requires: [],
            stamp: stamps.draftEditors[`site:${kind}`],
            value: kindValue(draftShape, kind),
        });
    }
    return units;
}

/** What a site kind's fingerprint covers: its fields of the draft's site. */
function kindValue(
    draft: Record<string, unknown>,
    kind: Exclude<SiteChangeKind, "pages" | "redirects">,
): unknown {
    const site = asObject(draft.site);
    switch (kind) {
        case "name":
            return [site.name, site.slug];
        case "search":
            return [site.seoTitle, site.seoDescription];
        case "shareImage":
            return [site.socialImageUrl, site.socialImage];
        case "posts":
            return site.postsPrefix;
        case "menu":
            return site.navigation;
        default:
            return site[kind];
    }
}

/** One person's changes; `userId` null is "Earlier changes" (A4). */
export interface ChangeGroup {
    userId: string | null;
    units: string[];
}

/**
 * Units by who last changed them: the most recent editor first, "Earlier
 * changes" last. Units keep their order within a group.
 */
export function groupByPerson(units: readonly ChangeUnit[]): ChangeGroup[] {
    const groups = new Map<string | null, { units: string[]; at: string }>();
    for (const u of units) {
        const g = groups.get(u.editedBy) ?? { units: [], at: "" };
        g.units.push(u.key);
        if (u.editedAt && u.editedAt > g.at) g.at = u.editedAt;
        groups.set(u.editedBy, g);
    }
    return [...groups.entries()]
        .sort(([a, ga], [b, gb]) =>
            a === null ? 1 : b === null ? -1 : gb.at.localeCompare(ga.at),
        )
        .map(([userId, g]) => ({ userId, units: g.units }));
}

/** `Site.draftEditors` read forgivingly: a malformed entry is no stamp. */
export function readDraftEditors(value: unknown): Record<string, ChangeStamp> {
    const out: Record<string, ChangeStamp> = {};
    for (const [key, raw] of Object.entries(asObject(value))) {
        const s = asObject(raw);
        if (typeof s.userId === "string" && typeof s.at === "string") {
            out[key] = { userId: s.userId, at: s.at };
        }
    }
    return out;
}

/** A section as a save holds it, for {@link carryStamps}. */
export interface StampedSection {
    key: string;
    type: string;
    contractVersion: number;
    content: unknown;
    hidden: boolean;
    lastEditedByUserId?: string | null;
    lastEditedAt?: Date | null;
}

/**
 * Who last changed each section after a save (U7): a section whose content,
 * visibility or place changed is stamped with `by`; one that only had
 * neighbours move around it keeps its stamp, carried by key across the
 * delete-and-recreate. `removed` is the keys this save took away.
 */
export function carryStamps(
    previous: readonly StampedSection[],
    next: readonly Omit<
        StampedSection,
        "lastEditedByUserId" | "lastEditedAt"
    >[],
    by: { userId: string; at: Date },
): {
    stamps: { lastEditedByUserId: string | null; lastEditedAt: Date | null }[];
    removed: string[];
} {
    const before = new Map(previous.map((s) => [s.key, s]));
    const nextKeys = new Set(next.map((s) => s.key));
    const kept = inPlace(
        next.map((s) => s.key).filter((k) => before.has(k)),
        previous.map((s) => s.key).filter((k) => nextKeys.has(k)),
    );
    return {
        stamps: next.map((s) => {
            const old = before.get(s.key);
            const same =
                old !== undefined &&
                kept.has(s.key) &&
                old.hidden === s.hidden &&
                canonical([old.type, old.contractVersion, old.content]) ===
                    canonical([s.type, s.contractVersion, s.content]);
            return same
                ? {
                      lastEditedByUserId: old.lastEditedByUserId ?? null,
                      lastEditedAt: old.lastEditedAt ?? null,
                  }
                : { lastEditedByUserId: by.userId, lastEditedAt: by.at };
        }),
        removed: previous.map((s) => s.key).filter((k) => !nextKeys.has(k)),
    };
}
