import type { Catalog } from "@saroh/pricing-catalog";

/**
 * The shapes `/admin/pricing` answers with (plans catalogue U3, U4), as the
 * console reads them. Client-safe: types only, so the Plans & modules tabs
 * can import them without reaching `next/headers` (`lib/pricing.ts` reads,
 * `lib/pricing-actions.ts` writes).
 *
 * They mirror `apps/api.saroh.in/src/modules/pricing/*.service.ts`; the API
 * is the authority, and a field added there is added here when a screen
 * needs it.
 */

export interface StaffName {
    userId: string;
    name: string | null;
    email: string | null;
}

/**
 * Waiting: its go-live has passed but its paid plans aren't at the billing
 * provider yet, so the version before it is still live.
 */
export type VersionStatus = "live" | "scheduled" | "waiting" | "earlier";

export interface VersionSync {
    pending: number;
    synced: number;
    failed: number;
}

export interface AdminVersion {
    version: number;
    goLiveAt: string;
    status: VersionStatus;
    policy: string;
    note: string;
    /** The change log, in words. */
    changes: string[];
    /** Null for a version nobody published from the console (the installer). */
    publishedBy: StaffName | null;
    createdAt: string;
    /** Businesses whose subscription is on this version. */
    businesses: number;
    /** Subscriptions with a pending move to this version. */
    moving: number;
    sync: VersionSync;
    catalog: Catalog;
}

export interface AdminDraft {
    /** As saved: it may not validate while it is being edited. */
    catalog: unknown;
    revision: number;
    baseVersion: number | null;
    createdAt: string;
    updatedAt: string;
    updatedBy: StaffName | null;
    /** Everyone who has saved this draft, first save first (D-2). */
    editors: StaffName[];
    valid: boolean;
    /** What stops it being published, in the words shown beside Publish. */
    errors: string[];
    /** What it changes from the live version; empty when invalid. */
    changes: string[];
}

export interface AdminPlanCount {
    planId: string;
    name: string;
    retired: boolean;
    businesses: number;
    /** Of those, on a catalogue version other than the live one. */
    olderVersion: number;
}

export interface ModuleUsage {
    moduleId: string;
    businesses: number;
    measured: boolean;
    using: number | null;
    highest: number | null;
    over: number | null;
    near: number | null;
    /** Each business's count, highest first, unnamed. */
    values: number[] | null;
    /** The design's line, or null when there is nothing true to say. */
    line: string | null;
}

/** `GET /admin/pricing`. */
export interface AdminPricing {
    now: string;
    liveVersion: number | null;
    draft: AdminDraft | null;
    /** Newest first. */
    versions: AdminVersion[];
    /** What the counts and usage are worked out against. */
    editing: "draft" | "live" | null;
    plans: AdminPlanCount[];
    /** By plan id, one entry per module in catalogue order. */
    usage: Record<string, ModuleUsage[]>;
    businesses: { total: number; measured: string[] };
}

export type ImpactTone = "danger" | "warn" | "ok" | "info";

export interface ImpactItem {
    tone: ImpactTone;
    label: string;
    title: string;
    detail: string;
    businesses: { id: string; name: string }[];
}

export interface Impact {
    items: ImpactItem[];
    /** Businesses any item touches. */
    touched: number;
    total: number;
    /** Plan revenue a month, before GST, in paise. */
    revenue: { nowPaise: number; nextPaise: number };
}

/** `GET /admin/pricing/impact`. */
export interface AdminPricingImpact {
    /** The draft revision this was worked out for. */
    revision: number;
    liveVersion: number | null;
    impact: Impact;
}

export interface PreviewToken {
    token: string;
    expiresAt: string;
    revision: number;
}

/** `PUT /admin/pricing/draft`. */
export interface DraftSaved {
    revision: number;
    baseVersion: number | null;
    createdAt: string;
    updatedAt: string;
    valid: boolean;
    errors: string[];
    changes: string[];
}

/**
 * A refused draft write's `details` (409): who saved since, or
 * `revision: null` when the draft was published or discarded meanwhile.
 */
export interface DraftConflict {
    revision: number | null;
    updatedBy: StaffName | null;
    updatedAt: string | null;
}

export type PublishPolicy = "keep" | "move";

/** `POST /admin/pricing/publish` and `…/versions/:v/rollback`. */
export interface PublishResult {
    version: number;
    goLiveAt: string;
    /** Waiting: for the billing provider's plans (U15). */
    status: "live" | "scheduled" | "waiting";
    policy: PublishPolicy;
    changes: string[];
    moves: { moved: number; notices: number };
    providerPlans: number;
}

/** `DELETE /admin/pricing/versions/:v`. */
export interface CancelResult {
    cancelled: number;
    movesCleared: number;
}

export interface AdminCoupon {
    id: string;
    code: string;
    discountPaise: number;
    months: number;
    planIds: string[];
    /** The Razorpay Offer made in its Dashboard; null: none linked. */
    razorpayOfferId: string | null;
    active: boolean;
    maxRedemptions: number;
    expiresAt: string | null;
    /** Businesses that have used it (one use each). */
    uses: number;
    createdAt: string;
    updatedAt: string;
}

export interface CouponInput {
    code: string;
    discountPaise: number;
    months: number;
    planIds: string[];
    maxRedemptions: number;
    expiresAt?: string | null;
    razorpayOfferId?: string | null;
    active?: boolean;
}

/** A person's name as the console says it: name, else email, else "Someone". */
export function staffName(who: StaffName | null | undefined): string {
    const name = who?.name?.trim();
    if (name) return name;
    return who?.email ?? "Someone";
}
