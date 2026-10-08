/**
 * The Releases screen's words and arithmetic, kept apart from the screen so
 * they can be pinned by tests: which group a release sits in, the one chip
 * that says its state, who has it and why, and what a change would do.
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

/** The list's sections, in order, holding only the releases that match. */
export function groupReleases(
    flags: AdminFlag[],
    query = "",
): { group: ReleaseGroup; label: string; flags: AdminFlag[] }[] {
    return GROUPS.map(({ group, label }) => ({
        group,
        label,
        flags: flags.filter(
            (flag) =>
                flag.metadata.group === group && matchesSearch(flag, query),
        ),
    })).filter((section) => section.flags.length > 0);
}

/** The first release the list shows, for a page opened with none chosen. */
export function firstRelease(flags: AdminFlag[]): AdminFlag | undefined {
    return groupReleases(flags)[0]?.flags[0];
}

/** What a business gets when it has no setting of its own. */
export function defaultValue(flag: AdminFlag): boolean {
    return flag.enabledByDefault ?? false;
}

/** The one chip a release's row carries (R1, R12). */
export function stateChip(flag: AdminFlag): string {
    if (flag.enabledByDefault === true) {
        const off = flag.overrides.filter((o) => !o.enabled).length;
        return off === 0 ? "On for everyone" : `Off for ${off}`;
    }
    const on = flag.overrides.filter((o) => o.enabled).length;
    if (on > 0) return `On for ${on}`;
    return flag.enabledByDefault === null
        ? "Never switched on"
        : "Off for everyone";
}

/** Whether the chip reads as on (for its colour; the words carry it). */
export function chipIsOn(flag: AdminFlag): boolean {
    return (
        flag.enabledByDefault === true || flag.overrides.some((o) => o.enabled)
    );
}

/** One line under the title: the default, then who differs from it. */
export function effectiveSummary(flag: AdminFlag): string {
    if (flag.enabledByDefault === true) {
        const off = flag.overrides.filter((o) => !o.enabled).length;
        return off === 0
            ? "On for everyone."
            : `On for everyone, off for ${businesses(off)} set on their own.`;
    }
    const on = flag.overrides.filter((o) => o.enabled).length;
    const base =
        flag.enabledByDefault === null
            ? "Off for everyone · never switched on"
            : "Off for everyone";
    return on === 0
        ? `${base}.`
        : `${base}, on for ${businesses(on)} set on their own.`;
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
                `${businesses(ownOff)} stay${ownOff === 1 ? "s" : ""} off because ${ownOff === 1 ? "it's" : "they're"} set on ${ownOff === 1 ? "its" : "their"} own.`,
            );
        }
        return parts.join(" ");
    }
    const lose = rows.filter((r) => r.on && r.override === null).length;
    const keep = ownOn;
    return keep > 0
        ? `${businesses(lose)} lose ${name}; ${keep} keep${keep === 1 ? "s" : ""} it because ${keep === 1 ? "it's" : "they're"} set on ${keep === 1 ? "its" : "their"} own.`
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
