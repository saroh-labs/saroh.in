import type { Catalog } from "@saroh/pricing-catalog";
import { diff, formatInr, validateCatalog } from "@saroh/pricing-catalog";

import type {
    AdminPricing,
    AdminVersion,
    DraftConflict,
    Impact,
    StaffName,
} from "./pricing-types";
import { staffName } from "./pricing-types";

/**
 * The Plans & modules screen's rules, pure (plans catalogue U6): which tab a
 * link opens, what a draft changes, what the status bar says and what a
 * refused save means. Client-safe, and tested without a browser
 * (`pricing-draft.test.ts`).
 */

// ── Tabs ──────────────────────────────────────────────────────────────────

/** URL-driven (`?tab=`), so a tab can be linked and survives a reload (KTD-15). */
export const PLANS_TABS = [
    "plans",
    "modules",
    "offers",
    "versions",
    "publish",
] as const;
export type PlansTab = (typeof PLANS_TABS)[number];

/** An unknown or missing `?tab=` opens Plans. */
export function tabFrom(value: string | string[] | undefined): PlansTab {
    const v = Array.isArray(value) ? value[0] : value;
    return (PLANS_TABS as readonly string[]).includes(v ?? "")
        ? (v as PlansTab)
        : "plans";
}

/** The design's tab row: "Versions · N", "Review & publish · N" with a draft. */
export function tabLabels(input: {
    versions: number;
    hasDraft: boolean;
    changes: number;
    /** Nothing is live: there is nothing to count changes against. */
    firstVersion?: boolean;
}): Record<PlansTab, string> {
    return {
        plans: "Plans",
        modules: "Modules",
        offers: "Offers",
        versions: `Versions · ${input.versions}`,
        publish:
            input.hasDraft && !input.firstVersion
                ? `Review & publish · ${input.changes}`
                : "Review & publish",
    };
}

// ── Versions ──────────────────────────────────────────────────────────────

export function liveVersionOf(pricing: AdminPricing): AdminVersion | null {
    return pricing.versions.find((v) => v.status === "live") ?? null;
}

/** Versions still to go live, soonest first: scheduled, or waiting for billing. */
export function upcomingVersions(pricing: AdminPricing): AdminVersion[] {
    return pricing.versions
        .filter((v) => v.status === "scheduled" || v.status === "waiting")
        .sort((a, b) => a.goLiveAt.localeCompare(b.goLiveAt));
}

/** Who published a version, as the bar says it; the installer is "Saroh team". */
export function publishedByName(version: AdminVersion): string {
    return version.publishedBy ? staffName(version.publishedBy) : "Saroh team";
}

// ── The draft ─────────────────────────────────────────────────────────────

export interface DraftCheck {
    valid: boolean;
    /** What stops it being published; empty when valid. */
    errors: string[];
    /** What it changes from live, in words; empty when invalid or nothing is live. */
    changes: string[];
}

/**
 * What a draft changes, by the same rules as the API's save (`diff` against
 * the live version, nothing when it doesn't validate or nothing is live), so
 * the status bar moves as the operator types instead of a save later.
 */
export function checkDraft(live: Catalog | null, draft: unknown): DraftCheck {
    const r = validateCatalog(draft);
    if (!r.ok) return { valid: false, errors: r.errors, changes: [] };
    return {
        valid: true,
        errors: [],
        changes: live ? diff(live, r.catalog) : [],
    };
}

export function changeCount(n: number): string {
    return n === 1 ? "1 change" : `${n} changes`;
}

/**
 * The amber banner's second line: who is affected, what revenue does if
 * everyone moves, the first two changes. `impact` is null until it has been
 * worked out for the saved revision; the line then says only the changes.
 */
export function draftSummary(input: {
    check: DraftCheck;
    impact: Impact | null;
    /** Nothing is live yet: this draft would be the first version. */
    firstVersion?: boolean;
}): string {
    const { check, impact } = input;
    if (!check.valid) {
        const first = check.errors.at(0);
        const more = check.errors.length - 1;
        return (
            `Not ready to publish: ${first ?? "the draft doesn't add up yet"}` +
            (more > 0 ? ` · and ${more} more` : "")
        );
    }
    const parts: string[] = [];
    if (impact) {
        parts.push(
            impact.touched
                ? `${impact.touched} ${impact.touched === 1 ? "business" : "businesses"} affected`
                : "No business affected",
        );
        const d = impact.revenue.nextPaise - impact.revenue.nowPaise;
        if (d !== 0) {
            parts.push(
                `${d > 0 ? "+" : "−"}${formatInr(Math.abs(d))} a month if everyone moves`,
            );
        }
    }
    const { changes } = check;
    if (input.firstVersion) {
        parts.push("Nothing is live yet: publishing makes this version 1");
    } else if (changes.length === 0) {
        parts.push("Nothing differs from the live version yet");
    } else {
        parts.push(...changes.slice(0, 2));
        if (changes.length > 2) parts.push(`and ${changes.length - 2} more`);
    }
    return parts.join(" · ");
}

/**
 * The people a discard would throw work away for, besides the one
 * discarding (D-2). Empty when it was only them.
 */
export function otherEditors(
    editors: readonly StaffName[],
    me: { userId: string },
): StaffName[] {
    return editors.filter((e) => e.userId !== me.userId);
}

/** "Asha", "Asha and Ravi", "Asha, Ravi and 2 others". */
export function namesList(people: readonly StaffName[]): string {
    const names = people.map(staffName);
    if (names.length <= 1) return names[0] ?? "";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
    return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

// ── A refused save ────────────────────────────────────────────────────────

/** A 409's `details`, when it is the draft's conflict shape. */
export function parseConflict(details: unknown): DraftConflict | null {
    if (!details || typeof details !== "object") return null;
    const d = details as Record<string, unknown>;
    if (!("revision" in d)) return null;
    const revision = typeof d.revision === "number" ? d.revision : null;
    const by = d.updatedBy as StaffName | null | undefined;
    return {
        revision,
        updatedBy:
            by && typeof by === "object" && typeof by.userId === "string"
                ? by
                : null,
        updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : null,
    };
}

/** What the conflict notice says. */
export function conflictMessage(conflict: DraftConflict): string {
    if (conflict.revision === null) {
        return "The draft was published or discarded since you opened it. Reload to start from the live pricing.";
    }
    return `${staffName(conflict.updatedBy)} saved the draft since. Reload the draft to see their changes.`;
}
