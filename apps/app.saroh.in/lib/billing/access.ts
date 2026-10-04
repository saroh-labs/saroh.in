import type { LimitNotice } from "@saroh/pricing-catalog";
import {
    formatInr,
    limitNotice,
    limitWordsFor,
    MODULE_MAP,
} from "@saroh/pricing-catalog";

/**
 * What the business's plan gives it, as `GET organizations/:org/billing/access`
 * returns it (plans catalogue U12), and the merchant app's reading of it
 * (U14): the limit notices, the locks and the way to more. Pure — the read is
 * `getBillingAccess` in `lib/saroh-billing/service.ts`.
 *
 * Every figure is the API's. The client words it (`limitNotice`, the shared
 * rule) and formats money; it never works out a limit or a price.
 */

export interface UpgradeTo {
    planId: string;
    name: string;
    pricePaise: number;
}

/** One catalogue row. */
export interface ModuleAccessView {
    moduleId: string;
    name: string;
    what: string;
    /** on, or how it shows when off: locked (with a way up) or hidden. */
    state: "on" | "locked" | "hidden";
    limit: number | null;
    per: "" | "month";
    text: string;
    override: string;
    /** Metered use against `limit`; null for a switch or a row that is off. */
    usage: number | null;
    menu: string | null;
    child: string | null;
    upgradeTo: UpgradeTo | null;
}

export interface BillingAccessView {
    /** `legacy`: the catalogue doesn't reach this business yet; no rows. */
    source: "catalogue" | "legacy";
    /** Whether limits and locks are enforced (`PLAN_ENFORCEMENT`). */
    enforced: boolean;
    version: number | null;
    plan: { id: string; name: string } | null;
    /** What it pays a month before GST, in paise. */
    pricePaise: number | null;
    /** A plan it is on for a while (a launch offer, or grandfathering). */
    planOverride: { planKey: string; expiresAt: string | null } | null;
    pendingMove: {
        planId: string;
        version: number;
        from: string;
        waiting: "held" | "authorise" | null;
    } | null;
    modules: ModuleAccessView[];
}

/** Where every "Upgrade" goes: the plan picker, with the plan to look at. */
export function upgradeHref(planId?: string | null): string {
    return planId
        ? `/settings/billing?plan=${encodeURIComponent(planId)}#change-plan`
        : "/settings/billing#change-plan";
}

export function accessRow(
    view: BillingAccessView | null,
    moduleId: string,
): ModuleAccessView | null {
    return view?.modules.find((m) => m.moduleId === moduleId) ?? null;
}

const OFF: LimitNotice = { on: false, full: false };

/**
 * The 80% / 100% notice for one row, in the design's words (`limitNotice`,
 * `LIMIT_WORDS`) — or none: under 80%, a row with no cap, a business the
 * catalogue doesn't reach, or while limits aren't enforced (nothing would
 * stop them, so "you'll be stopped" would be untrue).
 */
export function rowNotice(
    view: BillingAccessView | null,
    moduleId: string,
): LimitNotice {
    if (!view || view.source !== "catalogue" || !view.enforced) return OFF;
    const row = accessRow(view, moduleId);
    const words = limitWordsFor(moduleId);
    if (!row || !words || row.state !== "on" || row.usage === null) return OFF;
    return limitNotice(
        {
            inc: true,
            limit: row.limit,
            plan: view.plan?.name ?? "",
            upgradeTo: row.upgradeTo?.name ?? "",
        },
        row.usage,
        words.what,
        words.paused,
    );
}

/**
 * The rail entries a catalogue row locks (`menu`/`child` in the catalogue),
 * as the app's addresses. The catalogue names them in the design's rail
 * words; a row whose entry has no address here locks nothing in the rail
 * (its writes are still refused, and say why).
 */
const MENU_HREFS: Readonly<Record<string, string>> = {
    website: "/sites",
    sell: "/commerce",
    "sell/Products": "/commerce/products",
    "sell/Orders": "/commerce/orders",
    bookingsx: "/bookings",
    paymentsx: "/billing",
};

/** A rail entry the plan locks: what it is and the plan that has it. */
export interface PlanLock {
    href: string;
    name: string;
    what: string;
    plan: string;
    upgradeTo: UpgradeTo | null;
}

/**
 * The rail entries locked by the plan, by address. Only while enforced: a
 * lock nothing enforces would be a claim the API doesn't back.
 */
export function planLocks(view: BillingAccessView | null): PlanLock[] {
    if (!view || view.source !== "catalogue" || !view.enforced) return [];
    const out: PlanLock[] = [];
    for (const m of view.modules) {
        if (m.state !== "locked" || !m.menu) continue;
        // Only a lock the API backs: a row under a registry module, or one
        // metering counts. A row nothing enforces yet (invoicing) locks
        // nothing in the rail, or the rail would say what isn't so.
        const entry = Object.prototype.hasOwnProperty.call(
            MODULE_MAP,
            m.moduleId,
        )
            ? MODULE_MAP[m.moduleId]
            : null;
        if (!entry || (!entry.registry && !entry.limitKey)) continue;
        const href = MENU_HREFS[m.child ? `${m.menu}/${m.child}` : m.menu];
        if (!href) continue;
        out.push({
            href,
            name: m.name,
            what: m.what,
            plan: view.plan?.name ?? "",
            upgradeTo: m.upgradeTo,
        });
    }
    return out;
}

/** "Billing and invoicing comes with Grow, ₹1,000 a month." */
export function upgradeLine(lock: {
    name: string;
    plan: string;
    upgradeTo: UpgradeTo | null;
}): string {
    if (!lock.upgradeTo) {
        return `${lock.name} isn't in your ${lock.plan} plan.`;
    }
    const up = lock.upgradeTo;
    const price =
        up.pricePaise > 0 ? `, ${formatInr(up.pricePaise)} a month + GST` : "";
    return `${lock.name} comes with ${up.name}${price}. You're on ${lock.plan}.`;
}
