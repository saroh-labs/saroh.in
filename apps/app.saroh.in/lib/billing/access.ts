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
    if (view?.source !== "catalogue" || !view.enforced) return OFF;
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
    if (view?.source !== "catalogue" || !view.enforced) return [];
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

/** "Invoices comes with Plan B, ₹111 a month + GST. You're on Plan A." */
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

/**
 * A row the plan leaves locked, while locks are enforced: what it is and
 * the way up. Null when it is on, hidden, not in this version, when the
 * catalogue doesn't reach the business, or while nothing enforces it (a
 * lock nothing enforces would be a claim the API doesn't back).
 */
export function rowLock(
    view: BillingAccessView | null,
    moduleId: string,
): PlanLock | null {
    if (view?.source !== "catalogue" || !view.enforced) return null;
    const row = accessRow(view, moduleId);
    if (row?.state !== "locked") return null;
    return {
        href: upgradeHref(row.upgradeTo?.planId),
        name: row.name,
        what: row.what,
        plan: view.plan?.name ?? "",
        upgradeTo: row.upgradeTo,
    };
}

/** What a screen says where the plan stops new online payments. */
export interface OnlinePaymentsLock {
    title: string;
    body: string;
    cta: string;
    href: string;
}

/**
 * The plan's stop on taking money online (rows `payments` and
 * `subscriptions`, under Payments), in words that are true: new online
 * payments, or new memberships, stop; what the business already has goes
 * on — memberships keep renewing, and invoices still go out, as a link to
 * view (DEC-070). Plan names are the catalogue's; no price is said here.
 * Null when nothing is locked, or while nothing enforces it.
 *
 * - `payments`: taking payment online — connecting a provider, pay links,
 *   the site's checkout.
 * - `subscriptions`: subscribing someone new — needs memberships and online
 *   payments both, so either row's lock stops it.
 */
export function onlinePaymentsLock(
    view: BillingAccessView | null,
    what: "payments" | "subscriptions",
): OnlinePaymentsLock | null {
    const lock =
        what === "payments"
            ? rowLock(view, "payments")
            : (rowLock(view, "subscriptions") ?? rowLock(view, "payments"));
    if (!lock) return null;
    const up = lock.upgradeTo;
    const on = lock.plan ? `You're on ${lock.plan}. ` : "";
    const cta = up ? `See ${up.name}` : "See plans";
    if (what === "payments") {
        return {
            title: up
                ? `Taking payment online comes with ${up.name}`
                : `Taking payment online isn't in your ${lock.plan || "current"} plan`,
            body: `${on}Invoices still go out, as a link to view, and customers pay you another way. Memberships you already have keep renewing.`,
            cta,
            href: lock.href,
        };
    }
    return {
        title: up
            ? `New memberships come with ${up.name}`
            : `New memberships aren't in your ${lock.plan || "current"} plan`,
        body: `${on}Everyone already subscribed keeps renewing, and nothing they hold is lost. Subscribing someone new needs ${up ? up.name : "another plan"}.`,
        cta,
        href: lock.href,
    };
}
