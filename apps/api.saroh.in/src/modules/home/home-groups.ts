import type {
    HomeAction,
    HomeEvidence,
    HomeMoneyTotal,
    HomeNeed,
    HomeNeedGroup,
    HomeNeedKind,
    HomeNeedOldest,
} from "./home-model";
import { EVIDENCE_LIMIT } from "./home-model";
import { rowsOf, sourceIndex } from "./home-needs";
import { HOME_NEED_KINDS } from "./home-today-first-model";
import { WEEK_PATHS } from "./home-week";

/**
 * Needs you, grouped by kind (DEC-171, Home plan U1): one group per kind of
 * thing to do, in the board's order, each with how many things it holds,
 * how many are late, the money it stands for, its oldest thing, its first
 * rows and how many more. Pure; `HomeService.build()` calls it once the
 * sources have been read and decorated.
 *
 * A group's rows are the flat list's rows (`rowsOf`, the same words and
 * inline actions), so a row reads the same in a group as it did in the
 * list. Its `count` is what the flat list's `needsTotal` counts for its
 * sources — a "3 more" row stands for three — so the header ("24 things"),
 * which is the sum of the groups, never disagrees with a group's own
 * count. A source that failed sends nothing, so its group is absent and
 * `unavailable` names it, as today.
 */

/** Which group each source goes in; anything else is SETUP's. */
const KIND_OF: Partial<Record<string, HomeNeedKind>> = {
    COMMERCE_OPEN_ORDERS: "ORDERS",
    COMMERCE_UNCOLLECTED_ORDERS: "ORDERS",
    PAYMENTS_OVERDUE_INVOICES: "BILLS",
    APPOINTMENTS_AWAITING_PAYMENT: "AWAITING_PAYMENT",
    CRM_UNANSWERED_MESSAGES: "ENQUIRIES",
    APPOINTMENTS_BOOKING_NOTES: "ENQUIRIES",
    CRM_OVERDUE_FOLLOWUPS: "ENQUIRIES",
    PAYMENTS_FAILED_RENEWALS: "PAYMENTS",
    PAYMENTS_REFUNDS_OWED: "PAYMENTS",
    COMMERCE_REFUNDS_FAILED: "PAYMENTS",
    PAYMENTS_PAUSES_WAITING: "PAYMENTS",
    COMMERCE_LOW_STAR_REVIEWS: "REVIEWS",
    COMMERCE_STOCK_SHORT: "STOCK",
    COMMERCE_STOCK_LOW: "STOCK",
};

/** Sources whose every row is late by what they are. */
const ALL_LATE = new Set([
    "COMMERCE_UNCOLLECTED_ORDERS",
    "PAYMENTS_OVERDUE_INVOICES",
    "PAYMENTS_REFUNDS_OWED",
    "COMMERCE_REFUNDS_FAILED",
    "CRM_OVERDUE_FOLLOWUPS",
    "COMMERCE_STOCK_SHORT",
]);

/** The list each group opens; else its first source's. */
const GROUP_HREF: Partial<Record<HomeNeedKind, string>> = {
    ORDERS: "/commerce/orders",
    BILLS: WEEK_PATHS.OVERDUE,
    AWAITING_PAYMENT: "/bookings",
    STOCK: "/commerce/stock?show=needs",
};

/** The group a source's action belongs in, or null when none. */
export function kindOf(action: Pick<HomeAction, "code" | "severity">) {
    const kind = KIND_OF[action.code];
    if (kind) return kind;
    // Advice ("Review this week's performance", "Add a product") needs
    // nobody, as on the flat list.
    return action.severity === "SUGGESTION" ? null : "SETUP";
}

/** How many of an action's things are late. */
function lateOf(action: HomeAction): number {
    if (action.late !== undefined) return action.late;
    if (ALL_LATE.has(action.code)) return action.count ?? 1;
    const evidence = action.evidence ?? [];
    if (evidence.length === 0) return action.tone === "bad" ? 1 : 0;
    return evidence.filter((ev) => (ev.tone ?? action.tone) === "bad").length;
}

/** The oldest dated thing among a group's sources, oldest `at` first. */
function oldestOf(actions: readonly HomeAction[]): HomeNeedOldest | null {
    let oldest: HomeEvidence | null = null;
    for (const action of actions) {
        for (const ev of action.evidence ?? []) {
            if (!ev.at) continue;
            if (!oldest?.at || ev.at < oldest.at) oldest = ev;
        }
    }
    if (!oldest) return null;
    return {
        id: oldest.id,
        title: oldest.title,
        who: oldest.subtitle,
        at: oldest.at,
        amountMinor: oldest.amountMinor,
        currency: oldest.currency,
    };
}

/** Money each group stands for, read beside its sources. */
export interface GroupMoney {
    /** Every unpaid bill's total and how many (the owed read). */
    bills?: { totals: HomeMoneyTotal[] | null; all: number } | null;
    /** The bookings awaiting payment's total. */
    awaiting?: HomeMoneyTotal[] | null;
}

/** A need with its amounts taken off, for a viewer without `payment:read`. */
function withoutMoney(need: HomeNeed): HomeNeed {
    const kept: HomeNeed = {
        ...need,
        amountMinor: null,
        currency: null,
        amountIn: null,
    };
    // A refund's words name its amount ("Refund ₹500"): its action goes
    // with the amount, and the row still opens the payment.
    if (kept.inline?.kind === "REFUND") delete kept.inline;
    return kept;
}

/**
 * The groups, in the board's order, with something in each. `money` is
 * whether the viewer holds `payment:read`: without it no group carries an
 * amount, a total or an oldest amount (DEC-098), and the counts still come.
 */
export function groupNeeds(
    actions: readonly HomeAction[],
    zone: string,
    view: { money: boolean; extra?: GroupMoney },
): { needGroups: HomeNeedGroup[]; needGroupsTotal: number } {
    const byKind = new Map<HomeNeedKind, HomeAction[]>();
    for (const action of actions) {
        const kind = kindOf(action);
        if (!kind) continue;
        const list = byKind.get(kind) ?? [];
        list.push(action);
        byKind.set(kind, list);
    }

    const needGroups: HomeNeedGroup[] = [];
    for (const kind of HOME_NEED_KINDS) {
        const sources = [...(byKind.get(kind) ?? [])].sort(
            (a, b) => sourceIndex(a.code) - sourceIndex(b.code),
        );
        if (sources.length === 0) continue;
        let late = 0;
        const ranked = sources.flatMap((a) => {
            const own = rowsOf(a, zone);
            const things = own.reduce((n, r) => n + r.things, 0);
            // Never more late than the things it counts (a short-stock
            // source is one row however many shelves it names).
            late += Math.min(things, lateOf(a));
            return own;
        });
        const count = ranked.reduce((n, r) => n + r.things, 0);
        if (count === 0) continue;
        // Rows in the flat list's order inside the group: worst first,
        // then by source, each source's own rows oldest first.
        const rows = ranked
            .filter((r) => !r.more)
            .sort((a, b) => a.rank - b.rank || a.source - b.source)
            .slice(0, EVIDENCE_LIMIT)
            .map((r) => (view.money ? r.need : withoutMoney(r.need)));
        const oldest = oldestOf(sources);
        const group: HomeNeedGroup = {
            kind,
            count,
            late,
            totals: null,
            oldest:
                oldest && !view.money
                    ? { ...oldest, amountMinor: null, currency: null }
                    : oldest,
            rows,
            more: Math.max(0, count - rows.length),
            href: GROUP_HREF[kind] ?? sources[0].href,
            codes: sources.map((a) => a.code),
        };
        if (kind === "BILLS" && view.extra?.bills) {
            group.all = view.extra.bills.all;
            group.totals = view.money ? view.extra.bills.totals : null;
        }
        if (kind === "AWAITING_PAYMENT" && view.money) {
            group.totals = view.extra?.awaiting ?? null;
        }
        needGroups.push(group);
    }
    return {
        needGroups,
        needGroupsTotal: needGroups.reduce((n, g) => n + g.count, 0),
    };
}
