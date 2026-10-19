import type {
    BusinessTab,
    BusinessTabBadge,
} from "@/components/business/business-tabs";

import type { NextChargeHow } from "./billing-words";
import { formatPaise, istDate } from "./billing-words";
import { asWords, camelToWords, formatDate } from "./format";
import type { EffectivePlan, UsageNote } from "./plan-words";

/**
 * A business's Overview as the API reads it (`GET /admin/organizations/
 * :id/overview`, admin plan U3): one read, no support session, no personal
 * data. Client-safe: the cards take their types and words from here.
 */

export type OverviewPanel<T> = { status: "ok"; data: T } | { status: "failed" };

export interface OverviewOffer {
    id: string;
    kind: string;
    moduleKey: string | null;
    planKey: string | null;
    key: string;
    value: number | null;
    expiresAt: string | null;
}

export interface OverviewPlan {
    /** Its Saroh subscription, for the subscription sheet's link (U5). */
    subscriptionId: string | null;
    effective: EffectivePlan | null;
    name: string | null;
    basePlanName: string | null;
    overrideEndsAt: string | null;
    status: string | null;
    pricePaise: number | null;
    planPricePaise: number | null;
    customPrice: { pricePaise: number; expiresAt: string | null } | null;
    nextCharge: {
        at: string | null;
        how: NextChargeHow;
        autopayRunsOutSoon: boolean;
    };
    offers: OverviewOffer[];
    livePlans: { id: string; name: string }[] | null;
}

export interface OverviewUsageRow {
    key: string;
    label: string;
    used: number | null;
    limit: number | null;
    planLimit: number | null;
    per: string;
    soft: boolean;
    over: boolean;
    changed: { expiresAt: string | null } | null;
    note: UsageNote | null;
    raisable: boolean;
}

export interface OverviewModules {
    on: number;
    off: number;
    locked: number;
    total: number;
    planLimitsEnforced: boolean;
    note: string | null;
}

export interface OverviewWebsite {
    sites: {
        id: string;
        name: string;
        published: boolean;
        addresses: { kind: "web-address" | "own-domain"; url: string }[];
    }[];
    payments: {
        provider: string;
        connected: boolean;
        needsAttention: boolean;
    }[];
    published: number;
    paymentsConnected: boolean;
}

export interface OverviewTeam {
    members: { name: string | null; role: string }[];
    count: number;
    invitesOpen: number;
}

/** Who at Saroh looks after the business (DEC-169, U25). */
export interface OverviewManager {
    platformAdminId: string;
    name: string;
    kind: "BROUGHT_IN" | "ASSIGNED";
    source: "LINK" | "CODE" | "LEAD_EMAIL" | "ASSIGNED";
    since: string;
}

/** Someone a business can be given to (`GET …/manager/candidates`). */
export interface ManagerCandidate {
    platformAdminId: string;
    name: string;
    businesses: number;
    /** Null: no cap set. */
    capacity: number | null;
    /** They look after this business now. */
    current: boolean;
}

/** "Asha · 3 of 10 businesses", "Asha · 1 business", with "full" at capacity. */
export function candidateLine(c: ManagerCandidate): string {
    const load =
        c.capacity === null
            ? c.businesses === 1
                ? "1 business"
                : `${c.businesses} businesses`
            : `${c.businesses} of ${c.capacity} businesses`;
    const full = c.capacity !== null && c.businesses >= c.capacity;
    return `${c.name} · ${load}${full ? ", full" : ""}`;
}

export interface OverviewAccountManager {
    /** Null: nobody looks after it yet. */
    manager: OverviewManager | null;
}

export interface OverviewActivityRow {
    id: string;
    source: "business" | "operator";
    action: string;
    at: string;
}

export interface OverviewBadges {
    billing: { needsYou: boolean; count: number };
    modules: { count: number } | null;
    team: { count: number } | null;
    notes: { count: number } | null;
}

export interface BusinessOverview {
    organizationId: string;
    plan: OverviewPanel<OverviewPlan>;
    /** Null: not for this caller. `name` null: no billing profile yet. */
    billedTo: { name: string | null } | null;
    usage: OverviewPanel<OverviewUsageRow[]>;
    modules: OverviewPanel<OverviewModules>;
    website: OverviewPanel<OverviewWebsite>;
    team: OverviewPanel<OverviewTeam>;
    accountManager: OverviewPanel<OverviewAccountManager>;
    activity: OverviewPanel<OverviewActivityRow[]>;
    notes: OverviewPanel<{ count: number; lastAt: string | null }>;
    badges: OverviewBadges;
}

/**
 * The tab strip's badges from the overview's (R1): Billing says "needs
 * you" while a billing action is open on the business; Modules, Team and
 * Notes carry their counts.
 */
export function overviewBadges(
    badges: OverviewBadges | null | undefined,
): Partial<Record<BusinessTab, BusinessTabBadge>> {
    if (!badges) return {};
    const out: Partial<Record<BusinessTab, BusinessTabBadge>> = {};
    if (badges.billing.needsYou) {
        out.billing = {
            count: badges.billing.count,
            tone: "danger",
            says: badges.billing.count === 1 ? "needs you" : "need you",
        };
    }
    if (badges.modules) out.modules = { count: badges.modules.count };
    if (badges.team) out.team = { count: badges.team.count };
    if (badges.notes && badges.notes.count > 0) {
        out.notes = { count: badges.notes.count };
    }
    return out;
}

/**
 * How the manager came to look after the business, in plain words: brought
 * in (their link, their code, or their lead) or given to them by staff.
 */
export function managerHow(manager: Pick<OverviewManager, "source">): string {
    switch (manager.source) {
        case "LINK":
            return "Brought in through their link";
        case "CODE":
            return "Brought in with their code";
        case "LEAD_EMAIL":
            return "Brought in from their lead";
        default:
            return "Given to them by Saroh's team";
    }
}

/** "Brought in through their link · since 3 Oct 2026". */
export function managerLine(manager: OverviewManager): string {
    return `${managerHow(manager)} · since ${formatDate(manager.since)}`;
}

/** "Plan C until 3 Nov 2026 · base plan Plan A", or "No plan yet". */
export function overviewPlanWords(p: OverviewPlan): string {
    if (!p.name) return "No plan yet, so they get the free basics";
    if (!p.effective?.override) return p.name;
    const until = p.overrideEndsAt
        ? `until ${formatDate(p.overrideEndsAt)}`
        : "until removed";
    return p.basePlanName && p.basePlanName !== p.name
        ? `${p.name} ${until} · base plan ${p.basePlanName}`
        : `${p.name} ${until}`;
}

/** "₹123.45 a month", and that it is a custom price until when. */
export function priceLine(plan: OverviewPlan): string | null {
    if (plan.pricePaise === null) return null;
    if (plan.pricePaise === 0 && !plan.customPrice) return "Free";
    const price = `${formatPaise(plan.pricePaise)} a month`;
    if (!plan.customPrice) return price;
    return plan.customPrice.expiresAt
        ? `${price} · custom price until ${formatDate(plan.customPrice.expiresAt)}`
        : `${price} · custom price until removed`;
}

/** The next charge and how it is paid. */
export function overviewNextCharge(plan: OverviewPlan): string {
    const { at, how, autopayRunsOutSoon } = plan.nextCharge;
    if (how === "AUTOPAY" && at) {
        return autopayRunsOutSoon
            ? `${istDate(at)} · autopay, which runs out soon`
            : `${istDate(at)} · autopay`;
    }
    if (how === "PAID_FOR_YEAR") return "Paid for the year";
    return "No charge due";
}

/** Who pays, for a `saroh-billing:read` holder. */
export function billedToLine(billedTo: { name: string | null }): string {
    return billedTo.name ?? "Chooses at first payment";
}

/** One running offer in words, with its end date. */
export function offerLine(
    offer: OverviewOffer,
    planName: (id: string) => string = (id) => id,
): string {
    const until = offer.expiresAt
        ? `until ${formatDate(offer.expiresAt)}`
        : "until removed";
    const row = offer.moduleKey ?? offer.key;
    switch (offer.kind) {
        case "plan":
            return `On ${planName(offer.planKey ?? "")} ${until}`;
        case "price":
            return `Custom price ${formatPaise(offer.value ?? 0)} a month ${until}`;
        case "grant":
            return `${camelToWords(row)} given ${until}`;
        case "remove":
            return `${camelToWords(row)} taken away ${until}`;
        case "limit":
            return `${camelToWords(row)} set to ${offer.value ?? "no limit"} ${until}`;
        case "raise":
            return `${camelToWords(row)} raised to ${offer.value ?? "—"} ${until}`;
        default:
            return `${asWords(offer.kind)}: ${camelToWords(row)} ${until}`;
    }
}

const COUNT = new Intl.NumberFormat("en-IN");
const count = (n: number) => COUNT.format(n);

/** "3 of 5", "3 of 2,500 a month", "3, no limit", "Not measured". */
export function usageLine(row: OverviewUsageRow): string {
    const per = row.per ? ` a ${row.per}` : "";
    if (row.used === null) {
        return row.limit === null
            ? "No limit"
            : `Up to ${count(row.limit)}${per}`;
    }
    if (row.limit === null) return `${count(row.used)}, no limit`;
    return `${count(row.used)} of ${count(row.limit)}${per}`;
}

const MEMBER_ROLE: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/** A team member's role in the business, in words. */
export function memberRole(role: string): string {
    return MEMBER_ROLE[role] ?? asWords(role);
}

/** An action key in words: `organization.module` → "Organization module". */
export function activityLabel(action: string): string {
    return asWords(action);
}
