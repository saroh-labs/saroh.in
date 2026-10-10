import { formatDate } from "./format";

/**
 * A business's way out, in words (#921, owner 9 Oct): the deletion trail
 * and the refunds a deletion waits on, as the business page shows them —
 * and, since DEC-119 (owner 10 Oct), its legal hold and how long its data
 * is kept after deletion. Client-safe: no server imports.
 */

/** The fields of a trail row these words read. */
export interface TrailRowLike {
    action: string;
    outcome: string;
    reason: string | null;
    actor: string | null;
    actorUserId: string;
    refunds: {
        count: number;
        owedMinorByCurrency: Record<string, number>;
    } | null;
    steps: { step: string; result: string }[] | null;
    /** An erase run that isn't finished: `more`, `failed` or `held`. */
    state?: string | null;
}

const TRAIL_TITLE: Record<string, string> = {
    "organization.deletion.scheduled": "Deletion scheduled",
    "organization.reinstated": "Reinstated",
    "organization.deletion.waiting_on_refunds": "Waiting on refunds",
    "organization.deleted": "Deleted",
    "organization.legal_hold.placed": "Legal hold placed",
    "organization.legal_hold.lifted": "Legal hold lifted",
};

const STEP: Record<string, string> = {
    // The clean-up, the day a business is deleted.
    jobs: "Pending jobs",
    billing: "Saroh billing",
    domains: "Custom domains",
    memberships: "Autopay mandates read",
    keys: "Payment and messaging keys",
    // The erase, 180 days on (and, before DEC-119, the clean-up's own).
    media: "Files",
    waitlist: "Class waitlists",
    contacts: "Customers",
    customers: "Location customers",
    records: "Orders, bookings, messages and the CRM",
    analytics: "Visitor events",
};

const STEP_RESULT: Record<string, string> = {
    ok: "done",
    failed: "failed",
    held: "held",
};

const ERASE_STATE: Record<string, string> = {
    held: "Erase stopped: legal hold",
    more: "Erase under way",
    failed: "Erase unfinished",
};

/** Every step of a run stood aside for a legal hold. */
function allHeld(steps: TrailRowLike["steps"]): boolean {
    return (
        steps !== null &&
        steps.length > 0 &&
        steps.every((s) => s.result === "held")
    );
}

/** What happened, as a title. */
export function trailTitle(
    row: Pick<TrailRowLike, "action" | "outcome"> &
        Partial<Pick<TrailRowLike, "steps" | "state">>,
): string {
    if (row.action === "organization.deletion.cleanup") {
        if (row.outcome === "SUCCESS") return "Clean-up finished";
        return allHeld(row.steps ?? null)
            ? "Clean-up held: legal hold"
            : "Clean-up unfinished";
    }
    if (row.action === "organization.retention.erase") {
        if (row.outcome === "SUCCESS") return "Data erased";
        return ERASE_STATE[row.state ?? ""] ?? "Erase unfinished";
    }
    return TRAIL_TITLE[row.action] ?? row.action;
}

/** The line under it: what was owed, how each step went, or who and why. */
export function trailDetail(row: TrailRowLike): string {
    if (row.refunds) {
        const owed = Object.entries(row.refunds.owedMinorByCurrency)
            .map(([currency, minor]) => formatMinor(minor, currency))
            .join(" + ");
        const count = `${row.refunds.count} ${row.refunds.count === 1 ? "refund" : "refunds"} still owed to customers`;
        return owed ? `${count} · ${owed}` : count;
    }
    if (row.steps) {
        if (allHeld(row.steps)) {
            return "Nothing was removed. It runs again when the hold is lifted.";
        }
        return row.steps
            .map(
                (s) =>
                    `${STEP[s.step] ?? s.step}: ${STEP_RESULT[s.result] ?? s.result}`,
            )
            .join(" · ");
    }
    const who =
        row.actor ??
        (row.actorUserId.startsWith("system:")
            ? "Saroh, automatically"
            : "An operator");
    return [row.reason, who].filter(Boolean).join(" · ");
}

/** A legal hold, as the business page reads it. */
export interface LegalHoldLike {
    at: string;
    reason: string | null;
    by: string | null;
}

/** Who placed the hold and when: "Placed 10 Oct 2026 by Priya". */
export function legalHoldLine(hold: LegalHoldLike): string {
    return `Placed ${formatDate(hold.at)} by ${hold.by ?? "an operator"}`;
}

/** What a hold means, for the operator about to act on the business. */
export const LEGAL_HOLD_MEANS =
    "Its data is kept. Nothing deletes or erases it, its deletion can't be scheduled, it can't be reinstated, and its people can't remove a customer's details or download its data, until a Platform Owner lifts the hold.";

/**
 * How long a deleted business's data is kept (DEC-119): "Data kept until
 * 8 Apr 2027", then "Data erased on …". On legal hold nothing is erased on
 * that day, and the line says so. Null for a business that isn't deleted.
 */
export function dataKeptLine(facts: {
    dataKeptUntil?: string | null;
    retentionErasedAt?: string | null;
    legalHold?: unknown;
}): string | null {
    if (facts.retentionErasedAt) {
        return `Data erased on ${formatDate(facts.retentionErasedAt)}`;
    }
    if (!facts.dataKeptUntil) return null;
    return facts.legalHold
        ? `Data kept while it is on legal hold (it would have been erased on ${formatDate(facts.dataKeptUntil)})`
        : `Data kept until ${formatDate(facts.dataKeptUntil)}`;
}

/** What "kept" and "erased" cover, under the line above. */
export const DATA_KEPT_MEANS =
    "Access ended the day it was deleted. Its data and files are kept for 180 days, then its files and personal data are erased; invoices, credit notes and orders stay as tax records.";

const STAGE: Record<string, string> = {
    OWED: "Not refunded yet",
    FAILED: "Refund failed",
    SENDING: "Being sent",
    CONFIRMING: "Sent, not confirmed",
};

/** Where one refund stands. */
export function refundStage(stage: string): string {
    return STAGE[stage] ?? stage;
}

/** An amount in minor units with its currency; "—" for none. */
export function formatMinor(
    minor: number | null,
    currency: string | null,
): string {
    if (minor === null) return "—";
    const major = minor / 100;
    if (!currency) {
        return new Intl.NumberFormat("en-IN", {
            maximumFractionDigits: 2,
        }).format(major);
    }
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(major);
}
