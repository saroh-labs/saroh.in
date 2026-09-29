import { DISPLAY_LOCALE } from "@/lib/format/locale";

import type { PackKind } from "./pack-cards";
import { money, unitWord } from "./pack-cards";
import type { Tone } from "./pack-detail";
import { count, day, dayWithWeekday } from "./pack-detail";
import type {
    PackDetail,
    PackEvent,
    PackUse,
    PackUseState,
    PackUsedPage,
} from "./pack-detail-data";
import { actorName } from "./pack-sales";
import { paidByLabel } from "./sell-words";

/**
 * Pack Detail's Used this week and Activity in words (round-2 E17, after
 * "Saroh Pack Detail"): each class spent from the pack with what became of
 * it, and each thing done to the pack with who did it. Pure.
 */

// — Used this week ——————————————————————————————————————————————————————

const USE_STATE: Record<PackUseState, { label: string; tone: Tone }> = {
    BOOKED: { label: "Booked", tone: "accent" },
    CAME: { label: "Came", tone: "ok" },
    NO_SHOW: { label: "No-show", tone: "bad" },
    CREDIT_BACK: { label: "Credit back", tone: "off" },
    LATE_CANCEL: { label: "Late cancel", tone: "bad" },
};

export interface UseRow {
    key: string;
    /** "Mon 29 Sep 07:00". */
    when: string;
    /** The class or session. */
    what: string;
    who: string;
    state: { label: string; tone: Tone };
}

function time(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(iso));
}

/**
 * One use's when ("Mon 29 Sep 07:00") and what became of it — shared with
 * Customer Detail's Packs tab (C7), so both say it the same way.
 */
export function useWords(
    u: Pick<PackUse, "startAt" | "state">,
    timeZone: string,
): { when: string; state: { label: string; tone: Tone } } {
    return {
        when: `${dayWithWeekday(u.startAt, timeZone)} ${time(u.startAt, timeZone)}`,
        state: USE_STATE[u.state],
    };
}

/** The week's uses, latest first, as the design lists them. */
export function usedRows(page: PackUsedPage, timeZone: string): UseRow[] {
    return page.uses
        .slice()
        .sort((a, b) => b.startAt.localeCompare(a.startAt))
        .map((u: PackUse) => ({
            key: `${u.bookingId}:${u.purchaseId}`,
            ...useWords(u, timeZone),
            what: u.service.name,
            who: u.contact.name,
        }));
}

/** When nothing was spent from the pack this week. */
export function usedEmptyText(kind: PackKind): string {
    return `No ${unitWord(kind, 2)} booked with this pack this week.`;
}

// — Activity ———————————————————————————————————————————————————————————

export interface ActivityRow {
    id: string;
    /** "12 Oct". */
    when: string;
    text: string;
    /** Who did it; "" when nobody is recorded. */
    who: string;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number";

/** One changed field in words: "price ₹1,500, was ₹1,200". */
function changeWords(
    field: string,
    pair: unknown,
    pack: Pick<PackDetail, "currency">,
    kind: PackKind,
): string | null {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [was, now] = pair as unknown[];
    const had = was !== null && was !== undefined;
    switch (field) {
        case "price": {
            if (!isStr(now)) return null;
            const to = money(now, pack.currency);
            return isStr(was)
                ? `price ${to}, was ${money(was, pack.currency)}`
                : `price ${to}`;
        }
        case "credits": {
            if (!isNum(now)) return null;
            const to = `${now} ${unitWord(kind, now)}`;
            return isNum(was) ? `${to}, was ${was}` : to;
        }
        case "validityDays": {
            if (!isNum(now)) return null;
            const to = `use within ${count(now, "day", "days")}`;
            return isNum(was) ? `${to}, was ${was}` : to;
        }
        case "name":
            return isStr(now)
                ? isStr(was) && was
                    ? `renamed to “${now}”, was “${was}”`
                    : `named “${now}”`
                : null;
        case "description":
            return "description changed";
        case "serviceIds":
            return `${kind === "ONE_TO_ONE" ? "sessions" : "classes"} it covers changed`;
        case "kind":
            return now === "ONE_TO_ONE"
                ? "now for one-to-one sessions"
                : "now for classes";
        case "firstPackOnly":
            return now === true
                ? "now for a first pack only"
                : had
                  ? "now open to anyone"
                  : null;
        case "currency":
            return isStr(now) ? `currency ${now}` : null;
        default:
            return null;
    }
}

function capital(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What an event says, in the design's words. */
export function activityText(
    e: PackEvent,
    pack: Pick<PackDetail, "currency">,
    kind: PackKind,
): string {
    const d = e.details;
    switch (e.kind) {
        case "CREATED":
            return "Created";
        case "PUBLISHED":
            return "Published — on sale";
        case "ARCHIVED":
            return "Archived — nobody new can buy it";
        case "RESTORED":
            return "Back on sale";
        case "CHANGED": {
            const parts = Object.entries(d)
                .map(([field, pair]) => changeWords(field, pair, pack, kind))
                .filter((x): x is string => x !== null);
            return parts.length > 0
                ? capital(parts.join("; "))
                : "Terms changed";
        }
        case "SOLD": {
            const to = e.holder ? `Sold to ${e.holder.name}` : "Sold";
            const price = isStr(d.price)
                ? money(d.price, isStr(d.currency) ? d.currency : pack.currency)
                : null;
            const paid = isStr(d.paidBy)
                ? paidByLabel(d.paidBy as Parameters<typeof paidByLabel>[0])
                : null;
            return [to, price, paid].filter(Boolean).join(" · ");
        }
        case "EXTENDED": {
            const days = isNum(d.days) ? count(d.days, "day", "days") : null;
            const whose = e.holder ? `${e.holder.name}'s pack` : "A pack";
            const why = isStr(d.reason) && d.reason ? ` — ${d.reason}` : "";
            return days
                ? `${whose} extended ${days}${why}`
                : `${whose} extended${why}`;
        }
        default:
            return "Changed";
    }
}

export function activityRow(
    e: PackEvent,
    pack: Pick<PackDetail, "currency">,
    kind: PackKind,
    timeZone: string,
): ActivityRow {
    return {
        id: e.id,
        when: day(e.createdAt, timeZone),
        text: activityText(e, pack, kind),
        who: actorName(e.actor) ?? "",
    };
}

/** Said at the end of the list when the pack is older than its history. */
export const EARLIER_UNRECORDED =
    "Earlier changes to this pack weren't recorded.";
