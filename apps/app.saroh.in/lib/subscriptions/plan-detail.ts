import type {
    Interval,
    Plan,
    PlanEvent,
    PlanEventsPage,
    PlanEventValue,
    Subscription,
} from "./service";
import type { Tone } from "./view";
import {
    classesText,
    dayText,
    listTab,
    longPrice,
    money,
    olderPrice,
    TAB_LABEL,
    TAB_TONE,
} from "./view";

/**
 * How Plan Detail says a plan (D4, after "Saroh Plan Detail"): its header,
 * Overview, Subscribers and History. Pure: every "now" is passed in, so the
 * words are tested once and the screen only draws them.
 */

/** Plans, as a tab of Subscriptions (D3): where Plan Detail goes back to. */
export const PLANS_HREF = "/billing/subscriptions?tab=plans";

export type DetailTab = "overview" | "subscribers" | "history";

/** `?tab=subscribers|history`; the design's own `subs` is taken too. */
export function detailTabFromQuery(value: string | undefined): DetailTab {
    if (value === "subscribers" || value === "subs") return "subscribers";
    return value === "history" ? "history" : "overview";
}

const EVERY: Record<Interval, string> = {
    WEEK: "week",
    MONTH: "month",
    QUARTER: "quarter",
    YEAR: "year",
};

function lower(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
}

function upper(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface PlanHeader {
    state: { label: string; tone: Tone };
    /** "₹2,500 every month · 8 classes a month · 12 people on it". */
    subline: string;
    /** The plain button beside Edit plan. */
    archiveLabel: "Archive" | "Open to sign-ups" | "Finish draft";
    /** The tinted line under the header, for a draft or an archived plan. */
    banner: string | null;
    /** A live plan holding changes nobody has published yet (D5). */
    unpublished: boolean;
}

/** `withClasses`: the business sells classes (Appointments on). */
export function planHeader(plan: Plan, withClasses: boolean): PlanHeader {
    const draft = plan.status === "DRAFT";
    const archived = plan.status === "ARCHIVED";
    const n = plan.subscriberCount;
    const parts = [
        `${money(plan.price, plan.currency)} every ${EVERY[plan.interval]}`,
        ...(withClasses ? [lower(classesText(plan.classesPerMonth))] : []),
        n === 1 ? "1 person on it" : `${n} people on it`,
    ];
    return {
        state: draft
            ? { label: "Draft", tone: "off" }
            : archived
              ? { label: "Archived", tone: "off" }
              : { label: "Open", tone: "ok" },
        subline: parts.join(" · "),
        archiveLabel: draft
            ? "Finish draft"
            : archived
              ? "Open to sign-ups"
              : "Archive",
        banner: draft
            ? "This is a draft — nobody can join it until you publish it."
            : archived
              ? "Archived — nobody new can join. Everyone already on it carries on as before."
              : null,
        unpublished: !draft && Boolean(plan.pendingChangedAt),
    };
}

/**
 * What's included: the plan's description, and — where classes are sold —
 * its allowance. A membership's classes are counted per calendar month
 * (`use-membership.ts`), and what isn't used that month is gone.
 */
export function includedText(
    plan: Pick<Plan, "description" | "classesPerMonth">,
    withClasses: boolean,
): { what: string; classes: string | null } {
    const n = plan.classesPerMonth;
    const what = plan.description?.trim() ?? "";
    return {
        what: what.length > 0 ? what : "No description yet.",
        classes: !withClasses
            ? null
            : n
              ? `${n} ${n === 1 ? "class" : "classes"} each month. Unused ones don't carry over.`
              : "Unlimited classes.",
    };
}

// — History ———————————————————————————————————————————————————————

type Changes = PlanEvent["changes"];

const str = (v: PlanEventValue | undefined): string | null =>
    v === null || v === undefined ? null : String(v);

/** Whether an event changed what the plan costs (price, currency or interval). */
function touchesPrice(changes: Changes): boolean {
    return "price" in changes || "currency" in changes || "interval" in changes;
}

/** "₹1,200", "₹1,200 / month" — a side of a price change. */
function priceSide(
    price: string | null,
    currency: string,
    interval: Interval | null,
): string {
    if (price === null) return "no price";
    return interval
        ? longPrice(price, currency, interval)
        : money(price, currency);
}

/**
 * A price change in words. The values an event didn't change aren't in it,
 * so only what changed is said: the amount, the interval, or both.
 */
function pricePhrase(changes: Changes, currency: string): string | null {
    const price = changes.price;
    const cur = changes.currency;
    const every = changes.interval;
    const curBefore = str(cur?.[0]) ?? str(cur?.[1]) ?? currency;
    const curAfter = str(cur?.[1]) ?? currency;
    if (price || cur) {
        const before = str(price?.[0]);
        const after = str(price?.[1]);
        const i0 = str(every?.[0]) as Interval | null;
        const i1 = str(every?.[1]) as Interval | null;
        if (!price) {
            return `changed the currency from ${curBefore} to ${curAfter}`;
        }
        return `changed the price from ${priceSide(before, curBefore, i0)} to ${priceSide(after, curAfter, i1)}`;
    }
    if (every) {
        const from = str(every[0]) as Interval | null;
        const to = str(every[1]) as Interval | null;
        return `changed billing from every ${from ? EVERY[from] : "—"} to every ${to ? EVERY[to] : "—"}`;
    }
    return null;
}

function classesSide(v: PlanEventValue | undefined): string {
    return typeof v === "number" && v > 0 ? `${v} a month` : "unlimited";
}

/** Each changed field as a phrase, in the order the plan reads. */
function editPhrases(changes: Changes, currency: string): string[] {
    const out: string[] = [];
    const name = changes.name;
    if (name) {
        out.push(
            `renamed it from “${str(name[0]) ?? ""}” to “${str(name[1]) ?? ""}”`,
        );
    }
    const price = pricePhrase(changes, currency);
    if (price) out.push(price);
    const cls = changes.classesPerMonth;
    if (cls) {
        out.push(
            `changed classes from ${classesSide(cls[0])} to ${classesSide(cls[1])}`,
        );
    }
    const desc = changes.description;
    if (desc) {
        const before = str(desc[0])?.trim();
        const after = str(desc[1])?.trim();
        out.push(
            !before
                ? "added what's included"
                : !after
                  ? "removed what's included"
                  : "changed what's included",
        );
    }
    return out;
}

/** What an event did, as a sentence. `currency` is the plan's, for amounts. */
export function eventWhat(event: PlanEvent, currency: string): string {
    const c = event.changes;
    switch (event.kind) {
        case "CREATED": {
            const price = str(c.price?.[1]);
            const every = str(c.interval?.[1]) as Interval | null;
            const cur = str(c.currency?.[1]) ?? currency;
            return price
                ? `Created at ${priceSide(price, cur, every)}`
                : "Created";
        }
        case "ARCHIVED":
            return "Archived — closed to new sign-ups";
        case "RESTORED":
            return "Opened to new sign-ups again";
        case "PUBLISHED":
            return "Published";
        case "DRAFT_DISCARDED":
            return "Discarded unpublished changes";
        default: {
            const phrases = editPhrases(c, currency);
            return phrases.length ? upper(phrases.join("; ")) : "Changed";
        }
    }
}

/** Who did it: their name, "Saroh support", "Saroh" for the job. */
export function eventWho(event: PlanEvent): string {
    if (event.actor.name) return event.actor.name;
    return event.actor.kind === "TEAM" ? "Someone on your team" : "Saroh";
}

export interface HistoryRow {
    id: string;
    date: string;
    what: string;
    who: string;
}

/**
 * History's rows, newest first, then a last line when that is all there is:
 * "Earlier changes weren't recorded" for a plan older than its history, or
 * "Nothing has happened yet." for one with none at all.
 */
export function historyRows(
    events: readonly PlanEvent[],
    more: { nextCursor: string | null; earlierUnrecorded: boolean },
    currency: string,
    timeZone: string,
    now: Date,
): HistoryRow[] {
    const rows: HistoryRow[] = events.map((e) => ({
        id: e.id,
        date: dayText(e.createdAt, timeZone, now),
        what: eventWhat(e, currency),
        who: eventWho(e),
    }));
    if (more.nextCursor) return rows;
    if (more.earlierUnrecorded) {
        rows.push({
            id: "earlier",
            date: "",
            what: "Earlier changes weren't recorded",
            who: "",
        });
    } else if (!rows.length) {
        rows.push({
            id: "none",
            date: "",
            what: "Nothing has happened yet.",
            who: "",
        });
    }
    return rows;
}

/**
 * At a glance's "Price changes": exact only when the whole history is in
 * hand. A plan older than its history says what was recorded, and a history
 * with more pages says "at least".
 */
export function priceChangesText(page: PlanEventsPage | null): string {
    if (!page) return "—";
    const n = page.events.filter(
        (e) => e.kind !== "CREATED" && touchesPrice(e.changes),
    ).length;
    if (page.nextCursor) return `${n}+`;
    if (page.earlierUnrecorded) return n ? `${n} recorded` : "None recorded";
    return String(n);
}

/** At a glance, in the design's order. */
export function glanceRows(
    plan: Pick<Plan, "subscriberCount" | "monthlyFromMembers" | "currency">,
    events: PlanEventsPage | null,
): { label: string; value: string }[] {
    // Whole rupees: a sense of size, as the Plans cards say it.
    const monthly = Math.round(Number(plan.monthlyFromMembers));
    return [
        { label: "On it now", value: String(plan.subscriberCount) },
        {
            label: "Coming in a month",
            value: monthly > 0 ? money(monthly, plan.currency) : "—",
        },
        { label: "Price changes", value: priceChangesText(events) },
    ];
}

// — Subscribers ———————————————————————————————————————————————————

export interface SubscriberRow {
    id: string;
    name: string;
    /** "Since 4 Jan". */
    since: string;
    status: { label: string; tone: Tone };
    /** "₹2,500 / month". */
    price: string;
    /** They keep a price the plan no longer sells at. */
    olderPrice: boolean;
    /** "Next 4 Oct", "Paused", "Ended 30 Sep". */
    when: string;
}

const ORDER = { active: 0, failed: 1, paused: 2, cancelled: 3 } as const;

/** The people on it: running first, ended last, each as the list says it. */
export function subscriberRows(
    subs: readonly Subscription[],
    plan: Pick<Plan, "id" | "price" | "currency">,
    now: Date,
): SubscriberRow[] {
    return [...subs]
        .sort((a, b) => ORDER[listTab(a)] - ORDER[listTab(b)])
        .map((s) => {
            const tab = listTab(s);
            const d = (at: string) => dayText(at, s.timezone, now);
            const when =
                tab === "cancelled"
                    ? s.cancelledAt
                        ? `Ended ${d(s.cancelledAt)}`
                        : "Ended"
                    : tab === "paused"
                      ? "Paused"
                      : s.startsAt
                        ? `Starts ${d(s.startsAt)}`
                        : s.endsAt
                          ? `Ends ${d(s.endsAt)}`
                          : s.nextRenewalAt
                            ? `Next ${d(s.nextRenewalAt)}`
                            : "";
            return {
                id: s.id,
                name: s.contact.name,
                since: `Since ${d(s.startedAt)}`,
                status: { label: TAB_LABEL[tab], tone: TAB_TONE[tab] },
                price: longPrice(s.price, s.currency, s.interval),
                olderPrice: olderPrice(s, [plan]) !== null,
                when,
            };
        });
}

/** Subscribers' empty state, by why nobody is on it. */
export function subscribersEmptyText(plan: Pick<Plan, "status">): string {
    if (plan.status === "DRAFT") {
        return "Publish the plan and people can join it.";
    }
    return plan.status === "ARCHIVED"
        ? "It's archived, so nobody new can join."
        : "When someone signs up, they'll show here.";
}
