import type {
    Subscription,
    SubscriptionEvent,
    SubscriptionEventPlan,
} from "./service";
import { dayText, money } from "./view";

/**
 * A subscription's log in words (D9), for its Changes card: what was done,
 * then when and by whom — "Paused · 1 Oct · Priya".
 */

export interface ChangeRow {
    id: string;
    what: string;
    /** "1 Oct · Priya". */
    when: string;
}

/** How many the card shows before "See all". */
export const FIRST_CHANGES = 10;

const WEEKDAYS = [
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
    "Sundays",
];

type Data = Record<string, unknown>;

/** How the log names an autopay method (D12). */
const AUTOPAY_METHOD: Record<string, string> = {
    UPI: "UPI",
    CARD: "card",
    EMANDATE: "bank account",
};

/** Where the customer set autopay up (D12). */
const SET_UP_FROM: Record<string, string> = {
    ACCOUNT: "from their account",
    PRICES: "from the Prices page",
    PAY_LINK: "from the pay link",
    SETUP_LINK: "from a set-up link",
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function plan(v: unknown): SubscriptionEventPlan | null {
    if (!v || typeof v !== "object") return null;
    const p = v as Partial<SubscriptionEventPlan>;
    return typeof p.name === "string" ? (p as SubscriptionEventPlan) : null;
}

function planPrice(p: SubscriptionEventPlan): string {
    return typeof p.price === "string" && typeof p.currency === "string"
        ? ` (${money(p.price, p.currency)})`
        : "";
}

/** What happened, in the merchant's words. */
export function changeWhat(
    event: SubscriptionEvent,
    sub: Pick<Subscription, "timezone">,
    now: Date,
): string {
    const data = event.data as Data;
    const day = (iso: unknown, withWeekday = false) => {
        const at = str(iso);
        return at ? dayText(at, sub.timezone, now, withWeekday) : "";
    };
    const invoice = event.invoice?.number ? ` · ${event.invoice.number}` : "";
    switch (event.kind) {
        case "SUBSCRIBED": {
            const p = plan(data.plan);
            const on = p
                ? ` on ${p.name}${p.price ? ` at ${money(p.price, p.currency)}` : ""}`
                : "";
            const starts = str(data.startsAt);
            return starts
                ? `Signed up${on}, starting ${day(starts)}`
                : `Started${on}`;
        }
        case "PAUSED":
            // D8: a pause with an end date says the day it resumes.
            return str(data.until)
                ? `Paused until ${day(data.until)}`
                : "Paused";
        case "RESUMED": {
            if (data.restarted === true) {
                return `Resumed — a new period started${invoice}`;
            }
            const days = num(data.extendedDays) ?? 0;
            return days > 0
                ? `Resumed — the paid period moved ${days} ${days === 1 ? "day" : "days"} later`
                : "Resumed";
        }
        case "CANCELLED":
            return "Cancelled";
        case "CANCEL_SCHEDULED":
            return `Cancelled — ends ${day(data.endsAt)}`;
        case "KEPT":
            return "Kept going — no longer ending";
        case "ENDED":
            return "Ended with its period";
        case "PLAN_CHANGE_BOOKED": {
            const to = plan(data.to);
            return to
                ? `Switching to ${to.name}${planPrice(to)} from ${day(data.from)}`
                : "Booked a plan change";
        }
        case "PLAN_CHANGE_CANCELLED":
            return "Cancelled the plan change";
        case "PLAN_CHANGED": {
            const to = plan(data.to);
            return to
                ? `Moved to ${to.name}${planPrice(to)}`
                : "Moved to a new plan";
        }
        case "COLLECTION_CHANGED": {
            const weekday = Array.isArray(data.weekday)
                ? num(data.weekday[1])
                : undefined;
            if (weekday === undefined) return "Changed the collection note";
            if (weekday === null) return "Stopped collections";
            return `Collects on ${WEEKDAYS[weekday - 1] ?? "a new day"} now`;
        }
        case "COLLECTION_SKIPPED":
            return `Skipped ${day(data.date, true)}`;
        case "COLLECTION_UNSKIPPED":
            return `Un-skipped ${day(data.date, true)}`;
        case "INVOICED":
            // D13B: two days early, so autopay charges on the renewal date.
            return data.early === true
                ? `Invoiced ${periodText(data, sub.timezone, now)} early, for autopay on the renewal date${invoice}`
                : `Invoiced ${periodText(data, sub.timezone, now)}${invoice}`;
        case "RENEWED":
            return data.uncharged === true
                ? "Renewed — nothing charged, every collection skipped"
                : `Renewed${invoice}`;
        case "RETRIED":
            return `Made a new pay link${invoice}`;
        case "RESUME_REFUSED":
            return "Couldn't resume on its own — Payments is off";
        case "RENEWAL_FAILED":
            // Autopay stood aside: the customer was paying by link.
            return data.reason === "CHECKOUT_OPEN"
                ? `Autopay didn't charge — the customer was paying by link${invoice}`
                : `Renewal payment failed${invoice}`;
        case "MANDATE_LIMIT_LOW":
            return "Not charged — above the autopay limit";
        case "MANDATE_SET_UP": {
            // D12: the method the customer picked.
            const method = str(data.method);
            const how = method ? AUTOPAY_METHOD[method] : undefined;
            return how ? `Autopay set up with ${how}` : "Autopay set up";
        }
        case "MANDATE_CANCELLED":
            // D20: autopay ends with what it was authorised for.
            switch (data.reason) {
                case "SUBSCRIPTION_ENDED":
                    return "Autopay cancelled — subscription ended";
                case "MERGED":
                    return "Autopay cancelled — customers merged";
                case "PRIVACY_REMOVAL":
                    return "Autopay cancelled — their details were removed";
                case "REPLACED":
                    return "Autopay replaced — they approved a new one";
                default:
                    return "Autopay cancelled";
            }
        case "MANDATE_LINK_SENT": {
            // D14: staff made a set-up link; "emailed" when Saroh sent it.
            const method = str(data.method);
            const how = method ? AUTOPAY_METHOD[method] : undefined;
            const what = how
                ? `Autopay set-up link made for ${how}`
                : "Autopay set-up link made";
            return data.emailed === true ? `${what} and emailed` : what;
        }
        case "CHARGED":
            return `Paid by autopay${invoice}`;
        case "EARLY_INVOICE_CANCELLED": {
            // D13B: the early renewal invoice, dropped before its period.
            const how = data.by === "CREDITED" ? "Credited" : "Voided";
            const why =
                data.reason === "PAUSED"
                    ? "paused"
                    : data.reason === "PLAN_CHANGED"
                      ? "plan changed"
                      : "cancelled";
            return `${how} the early renewal invoice — ${why} before the renewal, autopay not charged${invoice}`;
        }
        default:
            return "Changed";
    }
}

/** "1 Sep – 30 Sep": the last day shown is the day before the end. */
function periodText(data: Data, timeZone: string, now: Date): string {
    const start = str(data.periodStart);
    const end = str(data.periodEnd);
    if (!start || !end) return "a period";
    const last = new Date(new Date(end).getTime() - 86_400_000).toISOString();
    return `${dayText(start, timeZone, now)} – ${dayText(last, timeZone, now)}`;
}

/**
 * Who did it: "You", a team member's name, the subscriber from their own
 * account, Saroh (the renewal job) or Saroh support (an operator).
 */
export function changeWho(
    event: SubscriptionEvent,
    sub: Pick<Subscription, "contact">,
    viewerId: string | null,
): string {
    const { actor } = event;
    switch (actor.kind) {
        case "TEAM":
            if (viewerId && actor.userId === viewerId) return "You";
            return actor.name ?? "A team member";
        case "CUSTOMER": {
            const first = sub.contact.name.split(" ")[0] || sub.contact.name;
            // Autopay says where it was set up (D12).
            const from =
                event.kind === "MANDATE_SET_UP"
                    ? SET_UP_FROM[str((event.data as Data).source) ?? ""]
                    : undefined;
            return `${first}, ${from ?? "from their account"}`;
        }
        default:
            return actor.name ?? "Saroh";
    }
}

export function changeRows(
    events: readonly SubscriptionEvent[],
    sub: Pick<Subscription, "timezone" | "contact">,
    viewerId: string | null,
    now: Date,
): ChangeRow[] {
    return events.map((e) => ({
        id: e.id,
        what: changeWhat(e, sub, now),
        when: `${dayText(e.createdAt, sub.timezone, now)} · ${changeWho(e, sub, viewerId)}`,
    }));
}
