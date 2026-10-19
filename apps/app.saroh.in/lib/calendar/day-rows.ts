import { formatTime } from "@/lib/format/datetime";

import { shortName } from "./days-off";
import type { ItemLine } from "./layers";
import { describeItem } from "./layers";
import type { CalendarItem, LayerKey } from "./types";

/**
 * How one dated thing reads as a row of the picked day, after the Calendar
 * month boards (bookings U13, BKMOverviewMonth / BKDCalMonth): its time in
 * a column of its own, who it is for in bold, and what and with whom under
 * it — "9:00 am | Ananya Desai | Physio assessment · Meera". Built on the
 * calendar's own item line, so the record it opens and its flag stay the
 * ones the Week shows.
 */
export interface DayRow extends ItemLine {
    /** "9:00 am", when the thing has a time; else null. */
    time: string | null;
}

/** "With Meera Iyer · Paid online" → "Meera". */
function withWhom(subtitle: string | null | undefined): string | null {
    const m = /^With (.+?)(?: · |$)/.exec(subtitle ?? "");
    return m ? shortName(m[1]) : null;
}

const joined = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(" · ");

/** The day already says it is still to come; a row needn't again. */
const notAhead = (sub: string) => sub.replace(/(^| · )coming up$/, "").trim();

/** A title that starts with its own time: "9:00 am Mat Pilates". */
function withoutTime(title: string, time: string | null): string {
    return time && title.startsWith(`${time} `)
        ? title.slice(time.length + 1)
        : title;
}

const TIMED: ReadonlySet<LayerKey> = new Set<LayerKey>([
    "bookings",
    "classes",
    "invoices",
    "payments",
]);

export function dayRow(
    layer: LayerKey,
    item: CalendarItem,
    { timeZone, ahead }: { timeZone: string; ahead: boolean },
): DayRow {
    const line = describeItem(layer, item, { timeZone, ahead });
    const time =
        TIMED.has(layer) && item.at ? formatTime(item.at, timeZone) : null;
    const sub = notAhead(line.sub);

    if (layer === "bookings") {
        // The API's "Physio assessment · Ananya Desai": the service, then
        // who booked. The row leads with who.
        const cut = item.title.indexOf(" · ");
        const service = cut > 0 ? item.title.slice(0, cut) : null;
        const who = cut > 0 ? item.title.slice(cut + 3) : item.title;
        return {
            ...line,
            time,
            title: who,
            sub: joined(service, withWhom(item.subtitle)) || sub,
        };
    }
    if (layer === "invoices" && item.subtitle) {
        // "Paid · Rohan Mehta", then the invoice's number.
        const word = line.title.split(" · ")[0];
        return {
            ...line,
            time,
            title: `${word} · ${item.subtitle}`,
            sub: item.title,
        };
    }
    return { ...line, time, title: withoutTime(line.title, time), sub };
}
