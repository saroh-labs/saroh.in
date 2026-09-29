import { DateTime } from "luxon";

import type {
    HomeAction,
    HomeEvidence,
    HomeNeed,
    HomeSeverity,
    HomeTone,
} from "./home-model";

/**
 * Needs you, flat (round 2, F3): the ranked actions with each one's
 * evidence promoted to a row of its own, in the order the Home design lists
 * them. Pure; `HomeService.build()` calls it once the sources have been read.
 *
 * The design ranks by what has gone wrong, not by module:
 *
 * 1. Late, and someone is waiting: late orders, a note for a visit in the
 *    next two days, a message waiting on a reply, overdue invoices, money
 *    to refund, overdue follow-ups.
 * 2. Blocked: stock short for orders, a renewal not paid, a site not live, a
 *    module that needs fixing.
 * 3. Due: orders not late yet, notes for a later visit, low-rated reviews
 *    to answer.
 * 4. Setting up: a module not ready yet.
 *
 * Within a rank, sources keep {@link SOURCE_ORDER} (orders before invoices,
 * as the design lists them) and rows keep their source's order, oldest
 * first. Suggestions ("Review this week's performance") are advice, not
 * something that needs anyone, and stay off the list; they are still in
 * `actions`.
 */

type Rank = 1 | 2 | 3 | 4;

/** A row before it is sorted: the need, and where it sorts. */
interface Ranked {
    need: HomeNeed;
    rank: Rank;
    source: number;
    /** How many things it stands for: 1, or a "N more" row's N. */
    things: number;
}

/**
 * Sources in the order the design lists them within a rank: a patient's
 * note sits under the late orders and above the overdue invoices, and the
 * reviews come last. The design has no message row; a customer waiting on
 * a reply sits with the notes, as someone waiting on the business.
 */
const SOURCE_ORDER = [
    "COMMERCE_OPEN_ORDERS",
    "APPOINTMENTS_BOOKING_NOTES",
    "CRM_UNANSWERED_MESSAGES",
    "PAYMENTS_OVERDUE_INVOICES",
    "PAYMENTS_REFUNDS_OWED",
    "CRM_OVERDUE_FOLLOWUPS",
    "COMMERCE_STOCK_SHORT",
    "PAYMENTS_FAILED_RENEWALS",
    "WEBSITE_NOT_LIVE",
    "COMMERCE_LOW_STAR_REVIEWS",
] as const;

function sourceIndex(code: string): number {
    const i = (SOURCE_ORDER as readonly string[]).indexOf(code);
    // Module blockers, then anything a later unit adds without a place yet.
    if (i >= 0) return i;
    return code.endsWith("_ATTENTION") || code.endsWith("_SETUP")
        ? SOURCE_ORDER.length
        : SOURCE_ORDER.length + 1;
}

/** Where an action without a rower of its own sorts, by severity. */
const SEVERITY_RANK: Record<HomeSeverity, Rank> = {
    ATTENTION: 2,
    OVERDUE: 1,
    SETUP: 4,
    SUGGESTION: 4,
};

const SEVERITY_TONE: Record<HomeSeverity, HomeTone> = {
    ATTENTION: "bad",
    OVERDUE: "bad",
    SETUP: "info",
    SUGGESTION: "info",
};

/** The zone a business without one keeps its days in (as invoicing does). */
export const HOME_DEFAULT_ZONE = "Asia/Kolkata";

/** "14 Sep", in the business's zone. */
function day(at: string, zone: string): string {
    return DateTime.fromISO(at, { zone }).toFormat("d LLL");
}

/** "was due 14 Sep", or nothing when there is no due date. */
function wasDue(at: string | null, zone: string): string | null {
    return at ? `was due ${day(at, zone)}` : null;
}

/** "Placed today at 14:20", "Placed yesterday", "Placed 14 Sep". */
export function placedWords(at: string, now: Date, zone: string): string {
    const placed = DateTime.fromISO(at, { zone });
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    if (placed >= today) return `Placed today at ${placed.toFormat("HH:mm")}`;
    if (placed >= today.minus({ days: 1 })) return "Placed yesterday";
    return `Placed ${placed.toFormat("d LLL")}`;
}

function joined(...parts: (string | null | undefined)[]): string | null {
    const kept = parts.filter((p): p is string => !!p && p.trim().length > 0);
    return kept.length > 0 ? kept.join(" · ") : null;
}

function base(
    action: HomeAction,
    id: string,
): Pick<HomeNeed, "id" | "code" | "severity" | "moduleKey"> {
    return {
        id,
        code: action.code,
        severity: action.severity,
        ...(action.moduleKey ? { moduleKey: action.moduleKey } : {}),
    };
}

/** An evidence row as a need, before its source says its words. */
function fromEvidence(
    action: HomeAction,
    ev: HomeEvidence,
): Omit<HomeNeed, "title" | "sub" | "amountIn"> {
    return {
        ...base(action, `${action.code}:${ev.id}`),
        amountMinor: ev.amountMinor,
        currency: ev.currency,
        tag: ev.tag ?? null,
        tone: ev.tone ?? action.tone ?? SEVERITY_TONE[action.severity],
        href: ev.href,
        // F4: the action the row offers in place, when it offers one.
        ...(ev.inline ? { inline: ev.inline } : {}),
        ...(ev.link ? { link: ev.link } : {}),
    };
}

/** How a source's evidence reads as rows; absent, the action is one row. */
interface Rower {
    rank: (ev: Pick<HomeEvidence, "tone">) => Rank;
    row: (action: HomeAction, ev: HomeEvidence, zone: string) => HomeNeed;
    /** "3 more open orders", for what the source counted but didn't send. */
    more: (n: number) => string;
}

const ROWERS: Partial<Record<string, Rower>> = {
    COMMERCE_OPEN_ORDERS: {
        rank: (ev) => (ev.tone === "bad" ? 1 : 3),
        row: (action, ev) => ({
            ...fromEvidence(action, ev),
            title: ev.headline ?? `Order ${ev.title}`,
            // `detail` carries "Placed yesterday", worked out where the
            // clock and the zone were.
            sub: ev.detail ?? null,
            amountIn: ev.amountMinor === null ? null : "sub",
        }),
        more: (n) => `${n} more open order${n === 1 ? "" : "s"}`,
    },
    PAYMENTS_OVERDUE_INVOICES: {
        rank: () => 1,
        row: (action, ev, zone) => ({
            ...fromEvidence(action, ev),
            title: `overdue from ${ev.subtitle ?? "a customer"}`,
            sub: joined(ev.title, ev.detail, wasDue(ev.at, zone)),
            amountIn: "title",
        }),
        more: (n) => `${n} more overdue invoice${n === 1 ? "" : "s"}`,
    },
    PAYMENTS_REFUNDS_OWED: {
        rank: () => 1,
        row: (action, ev) => ({
            ...fromEvidence(action, ev),
            title: `to refund on ${ev.title}`,
            sub: ev.subtitle,
            amountIn: "title",
            tag: "Owed back",
            tone: "bad",
        }),
        more: (n) => `${n} more payment${n === 1 ? "" : "s"} to refund`,
    },
    CRM_OVERDUE_FOLLOWUPS: {
        rank: () => 1,
        row: (action, ev, zone) => ({
            ...fromEvidence(action, ev),
            title: ev.subtitle
                ? `Follow up with ${ev.subtitle}`
                : `Follow up on ${ev.title}`,
            sub: joined(ev.subtitle ? ev.title : null, wasDue(ev.at, zone)),
            amountIn: ev.amountMinor === null ? null : "sub",
        }),
        more: (n) => `${n} more overdue follow-up${n === 1 ? "" : "s"}`,
    },
    PAYMENTS_FAILED_RENEWALS: {
        rank: () => 2,
        row: (action, ev, zone) => {
            const who = ev.subtitle ? `${ev.subtitle}'s` : "A customer's";
            const renewal = `${who} ${ev.title} renewal`;
            const [title, sub] =
                ev.tag === "Payment failed"
                    ? [`${renewal} failed`, "The charge was declined."]
                    : ev.tag === "Autopay limit too low"
                      ? [
                            `${renewal} couldn't be charged`,
                            "Their autopay limit is lower than the renewal.",
                        ]
                      : [`${renewal} hasn't been paid`, wasDue(ev.at, zone)];
            return {
                ...fromEvidence(action, ev),
                title,
                sub,
                amountIn: ev.amountMinor === null ? null : "sub",
            };
        },
        more: (n) => `${n} more renewal${n === 1 ? "" : "s"} not paid`,
    },
    // F2: "Rahul Verma left a note when booking", the note quoted under it.
    APPOINTMENTS_BOOKING_NOTES: {
        rank: (ev) => (ev.tone === "due" ? 1 : 3),
        row: (action, ev) => ({
            ...fromEvidence(action, ev),
            title: ev.headline ?? `${ev.title} left a note when booking`,
            sub: ev.detail ?? null,
            amountIn: null,
        }),
        more: (n) =>
            `${n} more note${n === 1 ? "" : "s"} from the booking page`,
    },
    // F2: someone who wrote in and hasn't heard back.
    CRM_UNANSWERED_MESSAGES: {
        rank: () => 1,
        row: (action, ev) => ({
            ...fromEvidence(action, ev),
            title: ev.headline ?? `${ev.title} is waiting for a reply`,
            sub: ev.detail ?? null,
            amountIn: null,
        }),
        more: (n) =>
            `${n} more customer${n === 1 ? "" : "s"} waiting for a reply`,
    },
    // F2: "Farah Khan left 1 star", with what they said, the product and
    // the day it was left.
    COMMERCE_LOW_STAR_REVIEWS: {
        rank: () => 3,
        row: (action, ev, zone) => ({
            ...fromEvidence(action, ev),
            title: `${ev.subtitle ?? "A customer"} left ${ev.tag ?? "a low rating"}`,
            sub: joined(ev.detail, ev.title, ev.at ? day(ev.at, zone) : null),
            amountIn: null,
        }),
        more: (n) => `${n} more low-rated review${n === 1 ? "" : "s"}`,
    },
};

/** Sources shown as one row whatever their evidence, with their own words. */
const SINGLE: Partial<Record<string, { rank: Rank; sub: string }>> = {
    // The design's one row: Stock names the sizes, and by how many.
    COMMERCE_STOCK_SHORT: {
        rank: 2,
        sub: "Open orders are waiting on them. Stock shows which, and by how many.",
    },
    WEBSITE_NOT_LIVE: {
        rank: 2,
        sub: "Nobody can find you until you publish it.",
    },
    // D8: pauses that ended while Payments is off.
    PAYMENTS_PAUSES_WAITING: {
        rank: 2,
        sub: "Their pause has ended. Restarting starts a new paid period, so it waits until Payments is on.",
    },
};

/** A module's own blocker (readiness), as one row. */
function blockerRow(action: HomeAction): { need: HomeNeed; rank: Rank } {
    const attention = action.severity === "ATTENTION";
    return {
        rank: attention ? 2 : 4,
        need: {
            ...base(action, action.code),
            title: action.title,
            sub: null,
            amountMinor: null,
            currency: null,
            amountIn: null,
            tag: attention ? "Needs fixing" : "To set up",
            tone: attention ? "bad" : "info",
            href: action.href,
        },
    };
}

/** An action as its one row, in its own words. */
function actionRow(action: HomeAction, rank: Rank, sub: string | null) {
    return {
        rank,
        need: {
            ...base(action, action.code),
            title: action.title,
            sub,
            amountMinor: null,
            currency: null,
            amountIn: null,
            tag: action.tag ?? null,
            tone: action.tone ?? SEVERITY_TONE[action.severity],
            href: action.href,
        } satisfies HomeNeed,
    };
}

function rowsOf(action: HomeAction, zone: string): Ranked[] {
    const source = sourceIndex(action.code);
    const single = SINGLE[action.code];
    if (single) {
        return [
            {
                ...actionRow(action, single.rank, single.sub),
                source,
                things: 1,
            },
        ];
    }
    const rower = ROWERS[action.code];
    const evidence = action.evidence ?? [];
    if (!rower || evidence.length === 0) {
        if (
            action.code.endsWith("_ATTENTION") ||
            action.code.endsWith("_SETUP")
        ) {
            return [{ ...blockerRow(action), source, things: 1 }];
        }
        return [
            {
                ...actionRow(action, SEVERITY_RANK[action.severity], null),
                source,
                things: 1,
            },
        ];
    }

    const rows: Ranked[] = evidence.map((ev) => ({
        need: rower.row(action, ev, zone),
        rank: rower.rank(ev),
        source,
        things: 1,
    }));
    // What the source counted past the rows it sent is said, never dropped:
    // one row that stands for the rest and opens the full list.
    const hidden = (action.count ?? evidence.length) - evidence.length;
    if (hidden > 0) {
        const last = rows[rows.length - 1];
        // Ranked with the worst thing it stands for when the source says so
        // (a late order past the five shown is still late); else beside the
        // source's last row, so "3 more" follows its own.
        const tone = action.moreTone ?? last.need.tone;
        rows.push({
            need: {
                ...base(action, `${action.code}:more`),
                title: rower.more(hidden),
                sub: null,
                amountMinor: null,
                currency: null,
                amountIn: null,
                tag: null,
                tone,
                href: action.href,
            },
            rank: action.moreTone ? rower.rank({ tone }) : last.rank,
            source,
            things: hidden,
        });
    }
    return rows;
}

/**
 * The flat Needs-you list and how many things it stands for. `zone` is the
 * business's time zone, for "was due 14 Sep".
 */
export function flattenNeeds(
    actions: readonly HomeAction[],
    zone: string,
): { needs: HomeNeed[]; needsTotal: number } {
    const ranked = actions
        .filter((a) => a.severity !== "SUGGESTION")
        .flatMap((a) => rowsOf(a, zone));
    // Array.prototype.sort is stable, so rows keep their source's order.
    ranked.sort((a, b) => a.rank - b.rank || a.source - b.source);
    return {
        needs: ranked.map((r) => r.need),
        needsTotal: ranked.reduce((n, r) => n + r.things, 0),
    };
}
