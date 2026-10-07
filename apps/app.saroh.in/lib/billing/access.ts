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
    /** That plan has no cap on the row (UX-083); absent from an older API. */
    uncapped?: boolean;
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
    /**
     * A soft cap counts and tells the business, and never refuses (storage,
     * site visits). Absent from an API that predates it: a hard cap.
     */
    soft?: boolean;
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
 * stop them, so "you'll be stopped" would be untrue). A soft cap's notice
 * informs and never says anything stops.
 */
export function rowNotice(
    view: BillingAccessView | null,
    moduleId: string,
): LimitNotice {
    if (view?.source !== "catalogue" || !view.enforced) return OFF;
    const row = accessRow(view, moduleId);
    const words = limitWordsFor(moduleId);
    if (!row || !words || row.state !== "on" || row.usage === null) return OFF;
    const notice = limitNotice(
        {
            inc: true,
            limit: row.limit,
            plan: view.plan?.name ?? "",
            upgradeTo: row.upgradeTo?.name ?? "",
            upgradeUncapped: row.upgradeTo?.uncapped === true,
            soft: row.soft === true,
        },
        row.usage,
        words.what,
        words.paused,
        // Saroh's emails lead with "Connect your email" where the plan has
        // room to connect one, and with a higher plan where it hasn't (DEC-086).
        {
            action: words.action,
            actionOpen: words.action
                ? roomForOneMore(view, words.action.room)
                : undefined,
        },
    );
    return notice;
}

/**
 * Whether one more of a row's things would get past the API's check now
 * (`MeteringService.hasRoom`, the same decision as the write's), from the
 * figures the access read gave: for an enforced catalogue business only.
 * A row its version doesn't have is room, as the write goes ahead then; a
 * count it couldn't give is null, never room.
 */
export function roomForOneMore(
    view: BillingAccessView,
    moduleId: string,
): boolean | null {
    const row = accessRow(view, moduleId);
    if (!row) return true;
    const soft = row.soft === true;
    if (row.state !== "on") return soft;
    if (row.limit === null) return true;
    if (row.usage === null) return null;
    return soft || row.usage + 1 <= row.limit;
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

/**
 * The plan's stop on deposits (6 Oct 2026), said in the Service Editor:
 * a deposit is taken online, so setting one comes with the plan that takes
 * payment online (`payments` row). Nothing a business set up stops being
 * bookable: until then its services book "pay at the desk", and a service
 * that already has a deposit keeps it, paused, for when the plan has it
 * (`kept`). Plan names are the catalogue's; no price. Null when nothing is
 * locked, or while nothing enforces it (`rowLock`).
 */
export function depositLock(
    lock: PlanLock | null,
    kept: boolean,
): OnlinePaymentsLock | null {
    if (!lock) return null;
    const up = lock.upgradeTo;
    const on = lock.plan ? `You're on ${lock.plan}. ` : "";
    const until = up ? " until then" : "";
    return {
        title: up
            ? `Deposits are taken online, which comes with ${up.name}`
            : `Deposits are taken online, which isn't in your ${lock.plan || "current"} plan`,
        body: kept
            ? `${on}This service keeps its deposit, paused: it books "pay at the desk"${until}.`
            : `${on}Services book "pay at the desk"${until}.`,
        cta: up ? `See ${up.name}` : "See plans",
        href: lock.href,
    };
}

/**
 * The plan's stop on setting up memberships (6 Oct 2026), said on the Plans
 * tab and the New plan page: making a plan, publishing a draft and selling
 * an archived plan again come with the plan that has memberships (rows
 * `subscriptions` and `payments`, either locked stops it). What goes on is
 * said too, and true: members already on a plan keep renewing; the plans
 * stay here to edit or archive, but are off the site. Plan names are the
 * catalogue's; no price. Null when nothing is locked, or while nothing
 * enforces it (`rowLock`).
 */
export function membershipPlansLock(
    view: BillingAccessView | null,
): OnlinePaymentsLock | null {
    const lock = rowLock(view, "subscriptions") ?? rowLock(view, "payments");
    if (!lock) return null;
    const up = lock.upgradeTo;
    const on = lock.plan ? `You're on ${lock.plan}. ` : "";
    return {
        title: up
            ? `Memberships come with ${up.name}`
            : `Memberships aren't in your ${lock.plan || "current"} plan`,
        body: `${on}Members you already have keep renewing. Your plans stay here to edit or archive, but they're off your site, and new plans can't go on sale${up ? ` until you move to ${up.name}` : ""}.`,
        cta: up ? `See ${up.name}` : "See plans",
        href: lock.href,
    };
}

/**
 * Whether the plan lets the business take a new payment online (catalogue
 * row `payments`, the owner's rule of 6 Oct 2026, R33). The screens ask
 * this, as the API does (`online-payments-plan.ts`), before offering a pay
 * link or pay-online: off only where `rowLock` would say so — a locked
 * row while enforced. An unread plan, a business the catalogue doesn't
 * reach, or nothing enforcing it reads as yes, failing open as the API's
 * own check does; the write still says no if it must.
 */
export function takesOnlinePayment(view: BillingAccessView | null): boolean {
    return rowLock(view, "payments") === null;
}

/**
 * Whether a screen offers an online way to pay: the plan takes online
 * payment (`takesOnlinePayment`) and everything else the screen needs is
 * so — a provider that opens the checkout window, Payments switched on,
 * the viewer's powers. The one rule every pay-link and pay-online choice
 * reads (bookings, invoices, orders), so they can't drift apart; where it
 * is false the offline choices — cash, UPI, pay at the desk, on collection
 * — are what's offered.
 */
export function offersOnlinePay(
    view: BillingAccessView | null,
    ...also: boolean[]
): boolean {
    return takesOnlinePayment(view) && also.every(Boolean);
}

/**
 * Whether the plan has room for one more of the business's own email or
 * payment accounts (`integrations`, DEC-091), from the access read: only a
 * real no is no. Unread, legacy or unenforced is yes, failing open as the
 * connect's own check does.
 */
export function ownAccountsRoom(access: BillingAccessView | null): boolean {
    if (access?.source !== "catalogue" || !access.enforced) return true;
    return roomForOneMore(access, "integrations") !== false;
}
