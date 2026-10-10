import { cookies } from "next/headers";

import { adminFetch, getJson } from "./control-plane";
import type { EffectivePlan, UsageNote } from "./plan-words";

/**
 * Businesses on the instance, as the console reads them (plan U3–U5).
 * Server-only: every read forwards the operator's session to the API, which
 * decides what they may see.
 */

export type LifecycleStatus =
    "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED_RETAINED";

export type AttentionReason =
    | "PAST_DUE"
    | "FAILED_JOBS"
    | "FAILED_WEBHOOKS"
    /** A deleted business whose clean-up has failed and isn't done (#921). */
    | "DELETION_CLEANUP"
    /** Past its deletion window, held back by refunds owed (#921). */
    | "DELETION_WAITING_REFUNDS";

export interface BusinessRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus: LifecycleStatus;
    /**
     * On legal hold (DEC-122): its data is kept whatever is asked. Absent
     * from an older API.
     */
    legalHold?: boolean;
    createdAt: string;
    members: number;
    enabledModules: string[];
    /** Its subscription's plan row (what the Plan filter matches). */
    plan: { key: string; name: string } | null;
    /**
     * The plan it is on now, a plan override winning (UX-087). Null off the
     * catalogue, or from an older API: `plan` is the plan then.
     */
    effectivePlan?: EffectivePlan | null;
    subscriptionStatus: string | null;
    lastActiveAt: string | null;
    attention: AttentionReason[];
}

export interface BusinessPage {
    items: BusinessRow[];
    nextCursor?: string;
}

export interface BusinessQuery {
    q?: string;
    lifecycle?: string;
    plan?: string;
    module?: string;
    health?: string;
    /** `on`: only businesses on legal hold. */
    legalHold?: string;
    cursor?: string;
}

export type Panel<T> = { status: "ok"; data: T } | { status: "failed" };

/** One catalogue row as the business gets it (pricing U11). */
export interface CatalogueModuleRow {
    moduleId: string;
    name: string;
    /** What applies now: on, or how it shows when off. */
    state: "on" | "locked" | "hidden";
    limit: number | null;
    per: "" | "month";
    /** A soft cap: counted and told, never refused. Absent from an older API. */
    soft?: boolean;
    /** Its plan's own cell, before overrides and add-ons. */
    planState: "on" | "locked" | "hidden";
    planLimit: number | null;
    /** Why it differs from the plan, in words; empty when it doesn't. */
    override: string;
    usage: number | null;
    /** Why the count reads as it does. Absent from an older API. */
    usageNote?: UsageNote | null;
    /** Whether it has a limit an operator can set. */
    limitable: boolean;
}

export interface BusinessOverride {
    id: string;
    /** raise, grant, remove, limit, price or plan. */
    kind: string;
    key: string;
    moduleKey: string | null;
    planKey: string | null;
    value: number | null;
    expiresAt: string | null;
    reason: string;
    createdAt: string;
}

export interface BusinessCatalogue {
    version: number;
    liveVersion: number | null;
    planId: string;
    planName: string;
    basePlanId: string;
    pricePaise: number;
    planPricePaise: number;
    planOverride: {
        id: string;
        planKey: string;
        expiresAt: string | null;
    } | null;
    pendingMove: { planId: string; version: number; from: string } | null;
    plans: { id: string; name: string }[];
    modules: CatalogueModuleRow[];
}

export interface BusinessPlan {
    /** The plan it is on now (UX-087); null off the catalogue. */
    effective?: EffectivePlan | null;
    /** The live catalogue's plans, whether or not it reaches the business. */
    liveCatalogue?: {
        version: number;
        plans: { id: string; name: string }[];
    } | null;
    subscription: {
        status: string;
        plan: {
            id: string;
            key: string;
            name: string;
            version: number;
            interval: string;
        };
        provider: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    } | null;
    /** Null while the catalogue doesn't reach the business. */
    catalogue: BusinessCatalogue | null;
    legacyReason: string | null;
    /** Every live override, newest first. */
    overrides: BusinessOverride[];
    /** Limits no catalogue row covers, or every key off the catalogue. */
    limits: {
        key: string;
        planValue: number | boolean | null;
        effective: number | boolean | null;
        usage: number | null;
        override: { id: string; value: number; expiresAt: string } | null;
    }[];
}

export interface BusinessView {
    facts: {
        id: string;
        name: string;
        slug: string;
        createdAt: string;
        lifecycleStatus: LifecycleStatus;
        suspendedAt: string | null;
        suspensionReason: string | null;
        deletionScheduledAt: string | null;
        deletionReason: string | null;
        /** Its legal hold (DEC-122): when, why and who; null when none. */
        legalHold?: LegalHoldFacts | null;
        /** When its deletion window ended and access was shut off. */
        deletedRetainedAt?: string | null;
        /** The day its files and personal data are erased (180 days on). */
        dataKeptUntil?: string | null;
        /** When the retention eraser finished with it. */
        retentionErasedAt?: string | null;
        timezone: string | null;
        country: string | null;
        counts: {
            members: number;
            sites: number;
            orders: number;
            openOrders: number;
            bookings: number;
            contacts: number;
        };
    };
    people: Panel<{
        members: {
            membershipId: string;
            userId: string;
            name: string | null;
            email: string | null;
            emailVerified: boolean;
            role: string;
        }[];
        invitations: {
            id: string;
            email: string | null;
            role: string;
            status: string;
            expiresAt: string;
            createdAt: string;
        }[];
    }>;
    modules: Panel<
        {
            key: string;
            label: string;
            status: "ENABLED" | "DISABLED" | "ARCHIVED" | "NOT_INSTALLED";
            dependencies: string[];
        }[]
    >;
    plan: Panel<BusinessPlan>;
    activity: Panel<
        {
            id: string;
            action: string;
            actorUserId: string;
            actor: string | null;
            targetType: string | null;
            outcome: string;
            createdAt: string;
        }[]
    >;
    operatorActions: Panel<
        {
            id: string;
            action: string;
            actorUserId: string;
            actor: string | null;
            reason: string | null;
            outcome: string;
            createdAt: string;
        }[]
    >;
    notes: Panel<
        {
            id: string;
            authorUserId: string;
            author: string | null;
            body: string;
            createdAt: string;
        }[]
    >;
    /** Each site's tracker switch (#897). Absent from an older API. */
    sites?: Panel<SiteTrackersRow[]>;
    /** Where its sites are live, and payments yes or no. Absent from an older API. */
    presence?: Panel<BusinessPresence>;
    /** Every deletion step on the admin ledger (#921). Absent from an older API. */
    deletionTrail?: Panel<DeletionTrailRow[]>;
    /** Refunds a closing business still owes (#921). Absent from an older API. */
    deletionRefunds?: Panel<DeletionRefundRow[]>;
}

/** A business's legal hold, as its page shows it (DEC-122). */
export interface LegalHoldFacts {
    at: string;
    reason: string | null;
    byUserId: string | null;
    /** A name; an email only to an operator who may read personal data. */
    by: string | null;
}

/** One step of a business's way out, from the admin ledger (#921). */
export interface DeletionTrailRow {
    id: string;
    action: string;
    outcome: string;
    reason: string | null;
    actorUserId: string;
    actor: string | null;
    createdAt: string;
    /** A run that waited on refunds: how many, and what is owed. */
    refunds: {
        count: number;
        owedMinorByCurrency: Record<string, number>;
    } | null;
    /** A clean-up or an erase run: each step and how it went. */
    steps: { step: string; result: string }[] | null;
    /** An erase run that isn't finished: `more`, `failed` or `held`. */
    state?: string | null;
}

/** A refund a deletion waits on (#921). */
export interface DeletionRefundRow {
    key: string;
    stage: "OWED" | "FAILED" | "SENDING" | "CONFIRMING";
    amountMinor: number | null;
    currency: string | null;
    /** Null unless the operator may read personal data. */
    customer: string | null;
    /** The order or invoice number. */
    paper: string | null;
    provider: string | null;
    providerRef: string | null;
    since: string;
}

/** One web address a site is live on (the API's `PresenceAddress`). */
export interface PresenceAddress {
    kind: "web-address" | "own-domain";
    url: string;
}

/** What the business's customers can reach (owner, 9 Oct). Never a key. */
export interface BusinessPresence {
    sites: {
        id: string;
        name: string;
        published: boolean;
        /** Empty while nothing is published. */
        addresses: PresenceAddress[];
    }[];
    payments: {
        provider: string;
        connected: boolean;
        needsAttention: boolean;
    }[];
}

/** One site and whether Saroh has switched its trackers off. */
export interface SiteTrackersRow {
    id: string;
    name: string;
    subdomain: string | null;
    /** Trackers the business has on. */
    trackersOn: number;
    switchedOff: {
        at: string;
        reason: string | null;
        byUserId: string | null;
    } | null;
    /** Who switched it off, in words, when the console may name them. */
    switchedOffBy: string | null;
}

export interface PlanOption {
    id: string;
    key: string;
    name: string;
    version: number;
    priceCents: number;
    currency: string;
    interval: string;
}

export function listBusinesses(
    query: BusinessQuery,
): Promise<BusinessPage | null> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query) as [
        string,
        string | undefined,
    ][]) {
        if (value) search.set(key, value);
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson<BusinessPage>(`/organizations${suffix}`);
}

export function getBusinessSummary(id: string): Promise<BusinessRow | null> {
    return getJson<BusinessRow>(
        `/organizations/${encodeURIComponent(id)}/summary`,
    );
}

export function listPlans(): Promise<PlanOption[] | null> {
    return getJson<PlanOption[]>("/plans");
}

/**
 * The name of the cookie holding this operator's support-access session for
 * one business. httpOnly and scoped to the console: the session id never
 * reaches page script, and each business has its own.
 */
export function accessCookieName(organizationId: string): string {
    return `console_access_${organizationId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export type BusinessViewResult =
    | { status: "ok"; view: BusinessView; sessionId: string }
    /** No open session, or the one we held has closed or expired. */
    | { status: "needs-access" }
    | { status: "not-found" };

/**
 * The business page's read. It needs an open support-access session; without
 * one — or once it has lapsed — the screen asks for a reason and opens one.
 */
export async function getBusinessView(
    organizationId: string,
): Promise<BusinessViewResult> {
    const sessionId = (await cookies()).get(
        accessCookieName(organizationId),
    )?.value;
    if (!sessionId) return { status: "needs-access" };

    const res = await adminFetch(
        `/organizations/${encodeURIComponent(organizationId)}`,
        { headers: { "x-admin-access-session": sessionId } },
    );
    if (res.status === 401 || res.status === 403) {
        return { status: "needs-access" };
    }
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) {
        throw new Error(`GET /admin/organizations/:id failed: ${res.status}`);
    }
    return {
        status: "ok",
        view: (await res.json()) as BusinessView,
        sessionId,
    };
}
