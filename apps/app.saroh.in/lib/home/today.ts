import type { HomeToday, HomeTodayItem } from "./service";

/**
 * Home's Today column (round 2, F5), as the design words it: which of the
 * day's rows show, what each says on its right, when Arrived and No-show
 * are offered, and the count beside the heading. The API sends the whole
 * day in the business's clock (`home-today.ts`); this decides what the
 * minute the page is looked at makes of it.
 *
 * Pure display: no server imports, safe in server and client components.
 */

/** A row that started this long ago still shows, to be marked. */
export const RECENT_MINUTES = 90;
/** How many rows still to come show; the rest are the calendar's. */
export const UPCOMING_SHOWN = 5;
/**
 * The desk may check someone in from an hour before the start, as the API
 * allows (`CHECK_IN_EARLY_MS`); a no-show only once it has started.
 */
export const CHECK_IN_EARLY_MINUTES = 60;

const MINUTE_MS = 60_000;

export interface TodayRow extends HomeTodayItem {
    /** The words on the right: "Next", "Arrived 09:32", "Not here yet"… */
    state: string;
    /** Offer Arrived: a booking nobody has marked, from an hour before. */
    canArrive: boolean;
    /** Offer No-show: a booking nobody has marked, once it has started. */
    canNoShow: boolean;
}

export interface TodayView {
    rows: TodayRow[];
    /** "3 still to come · 1 arrived · 1 not here yet", or "". */
    count: string;
    /** Draw the column at all. */
    visible: boolean;
    /** "Nothing booked today.": only when bookings were read. */
    empty: boolean;
}

/** "Arrived 09:32", or "Arrived" when the time wasn't sent. */
export function arrivedLabel(time: string | null): string {
    return time ? `Arrived ${time}` : "Arrived";
}

function stateOf(item: HomeTodayItem, started: boolean, next: boolean): string {
    if (item.outcome === "ATTENDED") return arrivedLabel(item.outcomeTime);
    if (item.outcome === "NO_SHOW") return "Didn't come";
    if (started) {
        if (item.kind === "BOOKING") return "Not here yet";
        if (item.kind === "CLASS") return "Started";
        return item.stage === "READY" ? "Ready" : "Not ready";
    }
    if (next) return "Next";
    return item.kind === "PICKUP" && item.stage === "READY" ? "Ready" : "";
}

/**
 * What Today shows at `now`: the rows that started in the last ninety
 * minutes (still to be marked), then the next five, in time order.
 */
export function todayView(today: HomeToday | null, now: Date): TodayView {
    if (!today) return { rows: [], count: "", visible: false, empty: false };
    const t = now.getTime();
    const startOf = (item: HomeTodayItem) => Date.parse(item.startAt);

    const upcoming = today.items.filter((i) => startOf(i) >= t);
    const recent = today.items.filter(
        (i) => startOf(i) < t && t - startOf(i) <= RECENT_MINUTES * MINUTE_MS,
    );
    const shown = [...recent, ...upcoming.slice(0, UPCOMING_SHOWN)];

    const rows = shown.map((item): TodayRow => {
        const start = startOf(item);
        const open =
            item.markable && item.kind === "BOOKING" && item.outcome === null;
        return {
            ...item,
            state: stateOf(item, start < t, item === upcoming[0]),
            canArrive: open && t >= start - CHECK_IN_EARLY_MINUTES * MINUTE_MS,
            canNoShow: open && t >= start,
        };
    });

    const arrived = recent.filter((i) => i.outcome === "ATTENDED").length;
    const waiting = recent.filter(
        (i) => i.kind === "BOOKING" && i.outcome === null,
    ).length;
    const count = [
        upcoming.length > 0 ? `${upcoming.length} still to come` : "",
        arrived > 0 ? `${arrived} arrived` : "",
        waiting > 0 ? `${waiting} not here yet` : "",
    ]
        .filter(Boolean)
        .join(" · ");

    return {
        rows,
        count,
        visible: today.bookings || rows.length > 0,
        empty: today.bookings && rows.length === 0,
    };
}

/** "09:32" now, in the business's zone: the time an Arrived is said. */
export function clockNow(now: Date, zone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(now);
}
