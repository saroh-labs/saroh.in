import { formatDate } from "@/lib/format";
import { publishedByName } from "@/lib/pricing-draft";
import type { AdminVersion, VersionStatus } from "@/lib/pricing-types";

/**
 * The Versions tab's words (plans catalogue U10), pure. Copy follows the
 * design; the move date is per subscription (design deviation D-6), so a
 * "move" version says when in those terms rather than naming one day.
 */

export const STATUS_WORDS: Record<VersionStatus, string> = {
    live: "Live",
    scheduled: "Scheduled",
    waiting: "Waiting for billing",
    earlier: "Earlier",
};

export const STATUS_BADGE: Record<
    VersionStatus,
    "success" | "info" | "warning" | "neutral"
> = {
    live: "success",
    scheduled: "info",
    waiting: "warning",
    earlier: "neutral",
};

/** The next version number a publish or a rollback would take. */
export function nextVersion(versions: readonly AdminVersion[]): number {
    return versions.reduce((n, v) => Math.max(n, v.version), 0) + 1;
}

/** "Published 26 Sep 2026 · Asha", or "Goes live …" for one still to come. */
export function whenLine(v: AdminVersion): string {
    const by = publishedByName(v);
    if (v.status === "scheduled") {
        return `Goes live ${formatDate(v.goLiveAt)} · ${by}`;
    }
    if (v.status === "waiting") {
        return `Due ${formatDate(v.goLiveAt)} · ${by}`;
    }
    return `Published ${formatDate(v.goLiveAt)} · ${by}`;
}

export function policyLine(v: AdminVersion): string {
    if (v.policy === "keep") return "Existing businesses kept their terms";
    if (v.policy === "move") {
        return "Existing businesses move at their first renewal a week after it goes live";
    }
    return "";
}

/** The design's changes list: up to six, or "First version". */
export function changesShown(v: AdminVersion): string[] {
    return (v.changes.length > 0 ? v.changes : ["First version"]).slice(0, 6);
}

/** "3 on it", "2 moving to it", "Nobody on it". */
export function onItLine(v: AdminVersion): string {
    const parts: string[] = [];
    if (v.businesses > 0) parts.push(`${v.businesses} on it`);
    if (v.moving > 0) parts.push(`${v.moving} moving to it`);
    return parts.length ? parts.join(" · ") : "Nobody on it";
}

/** The billing provider's side, said only while it isn't all done. */
export function syncLine(v: AdminVersion): string | null {
    const { pending, synced, failed } = v.sync;
    if (pending === 0 && failed === 0) return null;
    const total = pending + synced + failed;
    return (
        `Billing: ${synced} of ${total} ${total === 1 ? "plan" : "plans"} ready` +
        (failed > 0 ? ` · ${failed} failed` : "")
    );
}

/**
 * Why "Roll back to this" can't be used now, or null when it can. A draft
 * must be published or discarded first (the API refuses otherwise), and a
 * scheduled version must be cancelled before another is published.
 */
export function rollbackBlocked(input: {
    hasDraft: boolean;
    upcoming: AdminVersion | undefined;
}): string | null {
    if (input.hasDraft) return "Publish or discard your draft first";
    if (input.upcoming) {
        return `Cancel version ${input.upcoming.version}'s schedule first`;
    }
    return null;
}
