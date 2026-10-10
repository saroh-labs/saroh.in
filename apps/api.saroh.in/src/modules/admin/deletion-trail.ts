import { prisma } from "@saroh/database";

import { OrganizationLifecycleStatus } from "../organizations/organization-lifecycle.policy";
import type { OutstandingRefundStage } from "../payments/refunds-outstanding";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import {
    LEGAL_HOLD_LIFTED_ACTION,
    LEGAL_HOLD_PLACED_ACTION,
} from "./admin-lifecycle.service";
import { ORGANIZATION_DELETION_CLEANUP_ACTION } from "./organization-deletion-cleanup.handler";
import {
    ORGANIZATION_DELETED_ACTION,
    ORGANIZATION_DELETION_WAITING_ACTION,
} from "./organization-deletion.handler";
import { ORGANIZATION_RETENTION_ERASE_ACTION } from "./organization-retention-erase.handler";

/**
 * A business's way out, as the console shows it (#921, owner 9 Oct): the
 * deletion trail from the admin ledger, and the refunds a deletion waits
 * on. Cross-tenant reads behind the console's guards; the business page
 * reads them under a support session.
 */

/**
 * The sweep notes a waiting business once a day; a note older than two
 * runs is from a window since reinstated or moved, not this one.
 */
export const WAITING_FRESH_MS = 2 * 24 * 60 * 60 * 1000;

/** What the trail lists: every step of a deletion, the operator's too. */
export const DELETION_TRAIL_ACTIONS = [
    "organization.deletion.scheduled",
    "organization.reinstated",
    ORGANIZATION_DELETION_WAITING_ACTION,
    ORGANIZATION_DELETED_ACTION,
    ORGANIZATION_DELETION_CLEANUP_ACTION,
    // 180 days on: its files and personal data erased (DEC-122).
    ORGANIZATION_RETENTION_ERASE_ACTION,
    // A legal hold stops every step above (DEC-122).
    LEGAL_HOLD_PLACED_ACTION,
    LEGAL_HOLD_LIFTED_ACTION,
] as const;

/** The trail rows that carry each step's result. */
const STEPPED_ACTIONS: readonly string[] = [
    ORGANIZATION_DELETION_CLEANUP_ACTION,
    ORGANIZATION_RETENTION_ERASE_ACTION,
];

/** At most this many trail rows: a clean-up retried for days is many. */
const TRAIL_ROWS = 40;

/**
 * Of these businesses (all when omitted), the ones past their window and
 * still `PENDING_DELETION` because refunds are owed: the sweep noted it
 * within {@link WAITING_FRESH_MS}. The directory's "Deletion waiting on
 * refunds".
 */
export async function businessesWaitingOnRefunds(
    now: Date,
    ids?: readonly string[],
): Promise<Set<string>> {
    const notes = await prisma.adminAuditEvent.findMany({
        where: {
            action: ORGANIZATION_DELETION_WAITING_ACTION,
            createdAt: { gte: new Date(now.getTime() - WAITING_FRESH_MS) },
            organizationId: ids ? { in: [...ids] } : { not: null },
        },
        select: { organizationId: true },
        distinct: ["organizationId"],
    });
    const noted = notes.flatMap((n) =>
        n.organizationId ? [n.organizationId] : [],
    );
    if (noted.length === 0) return new Set();
    const waiting = await prisma.organization.findMany({
        where: {
            id: { in: noted },
            lifecycleStatus: OrganizationLifecycleStatus.PendingDeletion,
            deletionScheduledAt: { not: null, lte: now },
        },
        select: { id: true },
    });
    return new Set(waiting.map((o) => o.id));
}

export interface DeletionTrailRow {
    id: string;
    action: string;
    outcome: string;
    reason: string | null;
    /** Who: an operator's id, or the runner (`system:…`). */
    actorUserId: string;
    createdAt: Date;
    /** A waiting note: how many refunds, and what is owed by currency. */
    refunds: {
        count: number;
        owedMinorByCurrency: Record<string, number>;
    } | null;
    /** A clean-up or an erase run: each step's result (ok, failed, held). */
    steps: { step: string; result: string }[] | null;
    /** An erase run that isn't finished: `more`, `failed` or `held`. */
    state: string | null;
}

/** The deletion trail, newest first. */
export async function deletionTrail(
    organizationId: string,
): Promise<DeletionTrailRow[]> {
    const rows = await prisma.adminAuditEvent.findMany({
        where: { organizationId, action: { in: [...DELETION_TRAIL_ACTIONS] } },
        select: {
            id: true,
            action: true,
            outcome: true,
            reason: true,
            actorUserId: true,
            createdAt: true,
            metadata: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: TRAIL_ROWS,
    });
    return rows.map(({ metadata, ...row }) => ({
        ...row,
        refunds:
            row.action === ORGANIZATION_DELETION_WAITING_ACTION
                ? refundsOf(metadata)
                : null,
        steps: STEPPED_ACTIONS.includes(row.action) ? stepsOf(metadata) : null,
        state:
            row.action === ORGANIZATION_RETENTION_ERASE_ACTION
                ? stateOf(metadata)
                : null,
    }));
}

/** A refund a deletion waits on, as the console lists it. */
export interface DeletionRefundRow {
    key: string;
    stage: OutstandingRefundStage;
    amountMinor: number | null;
    currency: string | null;
    /** Null unless the operator may read personal data. */
    customer: string | null;
    /** The order or invoice number. */
    paper: string | null;
    provider: string | null;
    providerRef: string | null;
    since: Date;
}

/**
 * The refunds a closing business still owes, live — the same read the
 * sweep waits on. Empty for a business that isn't closing. The customer's
 * name only to an operator holding `organization:pii:read`.
 */
export async function deletionRefunds(
    organizationId: string,
    lifecycleStatus: string,
    caller: { canReadPii: boolean },
): Promise<DeletionRefundRow[]> {
    if (lifecycleStatus !== OrganizationLifecycleStatus.PendingDeletion) {
        return [];
    }
    const owed = await refundsOutstanding(prisma, organizationId);
    return owed.rows.map((r) => ({
        key: r.key,
        stage: r.stage,
        amountMinor: r.amountCents,
        currency: r.currency,
        customer: caller.canReadPii ? r.customer : null,
        paper: r.paper?.label ?? null,
        provider: r.provider,
        providerRef: r.providerRef,
        since: r.since,
    }));
}

function refundsOf(metadata: unknown): DeletionTrailRow["refunds"] {
    if (typeof metadata !== "object" || metadata === null) return null;
    const m = metadata as { count?: unknown; owedMinorByCurrency?: unknown };
    const owed: Record<string, number> = {};
    if (typeof m.owedMinorByCurrency === "object" && m.owedMinorByCurrency) {
        for (const [currency, amount] of Object.entries(
            m.owedMinorByCurrency,
        )) {
            if (typeof amount === "number") owed[currency] = amount;
        }
    }
    return {
        count: typeof m.count === "number" ? m.count : 0,
        owedMinorByCurrency: owed,
    };
}

function stateOf(metadata: unknown): string | null {
    if (typeof metadata !== "object" || metadata === null) return null;
    const state = (metadata as { state?: unknown }).state;
    return typeof state === "string" ? state : null;
}

function stepsOf(metadata: unknown): DeletionTrailRow["steps"] {
    if (typeof metadata !== "object" || metadata === null) return null;
    const steps = (metadata as { steps?: unknown }).steps;
    if (!Array.isArray(steps)) return null;
    return steps.flatMap((s: unknown) => {
        if (typeof s !== "object" || s === null) return [];
        const { step, result } = s as { step?: unknown; result?: unknown };
        return typeof step === "string" && typeof result === "string"
            ? [{ step, result }]
            : [];
    });
}
