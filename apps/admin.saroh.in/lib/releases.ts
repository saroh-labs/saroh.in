/**
 * The Releases screens' words and arithmetic, kept apart from the screens so
 * they can be pinned by tests: where a release stands (the pill and the
 * chips), who has it and why, and what a change would do. Plain words
 * (R16): "the default", "turned on for them alone", never "override".
 *
 * Client-safe: it takes types from `control-plane`, never values.
 */
import type { AdminFlag, AdminOrganization } from "./control-plane";

export type ReleaseGroup = AdminFlag["metadata"]["group"];

export const GROUPS: { group: ReleaseGroup; label: string }[] = [
    { group: "module", label: "Modules" },
    { group: "feature", label: "Features" },
    { group: "safety", label: "Safety switches" },
    { group: "migration", label: "Migrations" },
];

/** "1 business", "6 businesses". */
export function businesses(count: number): string {
    return `${count} ${count === 1 ? "business" : "businesses"}`;
}

/** Matches the code key or the name a business sees, ignoring case and `_`. */
export function matchesSearch(flag: AdminFlag, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const key = flag.key.toLowerCase();
    return (
        key.includes(q) ||
        key.replace(/_/g, " ").includes(q) ||
        flag.metadata.shownAs.toLowerCase().includes(q)
    );
}

/** What a business gets when it has no setting of its own. */
export function defaultValue(flag: AdminFlag): boolean {
    return flag.enabledByDefault ?? false;
}

/** Where a release stands, for the list's pill and its chips (R11). */
export type ReleaseState = "everyone" | "some" | "off";

export const STATE_LABEL: Record<ReleaseState, string> = {
    everyone: "On for everyone",
    some: "On for some",
    off: "Off",
};

/** The list's chips, in order: All, then each state. */
export const STATE_FILTERS: { value: ReleaseState | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "everyone", label: STATE_LABEL.everyone },
    { value: "some", label: STATE_LABEL.some },
    { value: "off", label: STATE_LABEL.off },
];

/**
 * On for everyone (the default is on and no business is turned off), on
 * for some (anything between), or off (no business has it).
 */
export function releaseState(flag: AdminFlag): ReleaseState {
    if (flag.enabledByDefault === true) {
        return flag.overrides.some((o) => !o.enabled) ? "some" : "everyone";
    }
    return flag.overrides.some((o) => o.enabled) ? "some" : "off";
}

/** Whether the pill reads as on (for its colour; the words carry it). */
export function chipIsOn(flag: AdminFlag): boolean {
    return releaseState(flag) !== "off";
}

/** How many businesses get the release now. */
export function haveItCount(
    flag: AdminFlag,
    organizations: AdminOrganization[],
): number {
    return whoHasIt(flag, organizations).filter((row) => row.on).length;
}

/** One line under the title: the default, then who differs from it. */
export function effectiveSummary(flag: AdminFlag): string {
    if (flag.enabledByDefault === true) {
        const off = flag.overrides.filter((o) => !o.enabled).length;
        return off === 0
            ? "On for everyone."
            : `On for everyone except ${businesses(off)} turned off for them alone.`;
    }
    const on = flag.overrides.filter((o) => o.enabled).length;
    if (on > 0) {
        return `Off for everyone except ${businesses(on)} turned on for them alone.`;
    }
    return flag.enabledByDefault === null
        ? "Off. It has never been turned on for anyone."
        : "Off for everyone.";
}

/** The Overview's figures (R11): the default and who differs from it. */
export interface ReleaseCounts {
    /** Off, On, or "Off · never turned on". */
    defaultLabel: string;
    turnedOn: number;
    turnedOff: number;
    /**
     * Following the default: when it is off, those who would get it if it
     * were turned on for everyone; when on, those who would lose it.
     */
    following: number;
    followingLabel: string;
    have: number;
    total: number;
}

export function releaseCounts(
    flag: AdminFlag,
    organizations: AdminOrganization[],
): ReleaseCounts {
    const rows = whoHasIt(flag, organizations);
    const on = defaultValue(flag);
    return {
        defaultLabel: on
            ? "On"
            : flag.enabledByDefault === null
              ? "Off · never turned on"
              : "Off",
        turnedOn: rows.filter((r) => r.override === true).length,
        turnedOff: rows.filter((r) => r.override === false).length,
        following: rows.filter((r) => r.override === null).length,
        followingLabel: on
            ? "Would lose it if turned off for everyone"
            : "Would get it if turned on for everyone",
        have: rows.filter((r) => r.on).length,
        total: rows.length,
    };
}

/** The list's rows that pass the chip and the search, in list order. */
export function filterReleases(
    flags: AdminFlag[],
    show: ReleaseState | "all",
    query: string,
): AdminFlag[] {
    return flags.filter((flag) => passesFilter(flag, show, query));
}

export function passesFilter(
    flag: AdminFlag,
    show: ReleaseState | "all",
    query: string,
): boolean {
    return (
        (show === "all" || releaseState(flag) === show) &&
        matchesSearch(flag, query)
    );
}

/** The list's order: by kind (Modules first), then by the name shown. */
export function sortReleases(flags: AdminFlag[]): AdminFlag[] {
    const rank = new Map(GROUPS.map(({ group }, i) => [group, i]));
    return [...flags].sort(
        (a, b) =>
            (rank.get(a.metadata.group) ?? 0) -
                (rank.get(b.metadata.group) ?? 0) ||
            a.metadata.shownAs.localeCompare(b.metadata.shownAs),
    );
}

/** A release's kind, in one word: "Module". */
export function groupLabel(group: ReleaseGroup): string {
    return (
        {
            module: "Module",
            feature: "Feature",
            safety: "Safety switch",
            migration: "Migration",
        } as const
    )[group];
}

/** A release's page; `tab` is "who", "history" or "about". */
export function releaseHref(
    key: string,
    tab?: "who" | "history" | "about",
): string {
    const base = `/releases/${encodeURIComponent(key)}`;
    return tab ? `${base}/${tab}` : base;
}

/**
 * Where an old `/flags` link lands (R11): `?release=` (or the inspector's
 * `?flag=`) opens that release, with `organizationId` on Who has it.
 */
export function flagsRedirect(params: {
    release?: string;
    flag?: string;
    organizationId?: string;
}): string {
    const key = params.release ?? params.flag;
    if (!key) return "/releases";
    if (params.organizationId) {
        return `${releaseHref(key, "who")}?organizationId=${encodeURIComponent(params.organizationId)}`;
    }
    return releaseHref(key);
}

/** Whether a review-by date has passed (YYYY-MM-DD compares as text). */
export function reviewOverdue(flag: AdminFlag, today: string): boolean {
    return flag.metadata.reviewBy < today;
}

export interface WhoRow {
    organizationId: string;
    name: string;
    on: boolean;
    /** The business's own setting, when it has one. */
    override: boolean | null;
    /** An own setting that matches the default: a leftover to remove. */
    sameAsDefault: boolean;
}

/** Every business, what it gets and why (R3). Own settings first. */
export function whoHasIt(
    flag: AdminFlag,
    organizations: AdminOrganization[],
): WhoRow[] {
    const fallback = defaultValue(flag);
    const own = new Map(
        flag.overrides.map((o) => [o.organizationId, o.enabled]),
    );
    const rows: WhoRow[] = organizations.map((org) => {
        const override = own.get(org.id) ?? null;
        return {
            organizationId: org.id,
            name: org.name,
            on: override ?? fallback,
            override,
            sameAsDefault: override !== null && override === fallback,
        };
    });
    // An override for a business the picker no longer lists still counts.
    for (const o of flag.overrides) {
        if (!organizations.some((org) => org.id === o.organizationId)) {
            rows.push({
                organizationId: o.organizationId,
                name: o.organizationName,
                on: o.enabled,
                override: o.enabled,
                sameAsDefault: o.enabled === fallback,
            });
        }
    }
    return rows.sort(
        (a, b) =>
            Number(b.override !== null) - Number(a.override !== null) ||
            a.name.localeCompare(b.name),
    );
}

/** The global change that applies now: on when off or never set, else off. */
export function globalChange(flag: AdminFlag): boolean {
    return flag.enabledByDefault !== true;
}

/**
 * What turning a release on (or off) for everyone does, counted from the
 * businesses and their own settings (R2): "6 businesses already have it;
 * 6 more will get it."
 */
export function globalImpact(
    flag: AdminFlag,
    organizations: AdminOrganization[],
    enabled: boolean,
): string {
    const rows = whoHasIt(flag, organizations);
    const name = flag.metadata.shownAs;
    const ownOn = rows.filter((r) => r.override === true).length;
    const ownOff = rows.filter((r) => r.override === false).length;
    const rest = rows.length - ownOn - ownOff;
    if (enabled) {
        const have = rows.filter((r) => r.on).length;
        const parts = [
            `${businesses(have)} already ${have === 1 ? "has" : "have"} it; ${rest} more will get it.`,
        ];
        if (ownOff > 0) {
            parts.push(
                `${businesses(ownOff)} stay${ownOff === 1 ? "s" : ""} off, turned off for ${ownOff === 1 ? "it" : "them"} alone.`,
            );
        }
        return parts.join(" ");
    }
    const lose = rows.filter((r) => r.on && r.override === null).length;
    const keep = ownOn;
    return keep > 0
        ? `${businesses(lose)} lose ${name}; ${keep} keep${keep === 1 ? "s" : ""} it, turned on for ${keep === 1 ? "it" : "them"} alone.`
        : `${businesses(lose)} lose ${name}.`;
}

/** Reasons offered as one tap; the field stays editable. */
export const QUICK_REASONS = [
    "Rolling out",
    "Turning off a problem",
    "Testing on a test business",
] as const;

const REASON_MAX = 500;

/** The reason an Undo is recorded with. */
export function undoReason(reason: string): string {
    return `Undo: ${reason}`.slice(0, REASON_MAX);
}

/** One write the console can make to a release. */
export type ReleaseChange =
    | { kind: "global"; enabled: boolean }
    | { kind: "set"; organizationId: string; enabled: boolean }
    | { kind: "clear"; organizationId: string };

/**
 * The change that takes another back: the default goes back to what it was
 * (off, when it had never been set: a default can't be unset), a new own
 * setting is cleared, and a changed or cleared one gets its old value back.
 */
export function inverseOf(
    change: ReleaseChange,
    before: AdminFlag,
): ReleaseChange {
    if (change.kind === "global") {
        return { kind: "global", enabled: before.enabledByDefault ?? false };
    }
    const previous = before.overrides.find(
        (o) => o.organizationId === change.organizationId,
    );
    return previous
        ? {
              kind: "set",
              organizationId: change.organizationId,
              enabled: previous.enabled,
          }
        : { kind: "clear", organizationId: change.organizationId };
}
