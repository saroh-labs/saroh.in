import { dateText } from "../booking-flow/model";
import { clockWords, timeWords } from "../lib/clock";

/**
 * The words a live fact says (DEC-172, plan U8, #1042), the same on every
 * look (the WV2Voice board). Pure, for tests.
 *
 * NO FAKE URGENCY: a count shows only when it is small and true, never as
 * a countdown, never "hurry", never a number that ticks.
 */

/** Places left shows only at this many or fewer (VA09, VD09: "5 or fewer"). */
export const PLACES_SHOWN_AT_MOST = 5;

/**
 * "3 places left", "Last place", or nothing: more than
 * {@link PLACES_SHOWN_AT_MOST} free says nothing (it isn't news), and a
 * full or unknown class says nothing here (Full is the timetable's word).
 * `short` is Live's strip: "3 left".
 */
export function placesLeftWords(
    placesLeft: number | null | undefined,
    { short = false }: { short?: boolean } = {},
): string | null {
    if (placesLeft === null || placesLeft === undefined) return null;
    if (!Number.isFinite(placesLeft) || placesLeft <= 0) return null;
    if (placesLeft > PLACES_SHOWN_AT_MOST) return null;
    if (placesLeft === 1) return "Last place";
    return short ? `${placesLeft} left` : `${placesLeft} places left`;
}

/** A `YYYY-MM-DD` one day on, read as a calendar date. */
function dayAfter(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

/**
 * When the next free time is, on the business's clock: "today, 6:00 pm",
 * "tomorrow, 7:00 am", "Wed 21 Oct, 7:00 am". `date` and `time` are the
 * read's own (the business's zone); `today` is the read's today.
 */
export function nextFreeWhen(
    at: { date: string; time: string },
    today: string,
): string {
    const time = clockWords(at.time);
    if (at.date === today) return `today, ${time}`;
    if (at.date === dayAfter(today)) return `tomorrow, ${time}`;
    return `${dateText(at.date, true)}, ${time}`;
}

/** "Checked 5:20 pm", on the business's clock. */
export function checkedWords(fetchedAt: number, timeZone: string): string {
    let time: string;
    try {
        time = timeWords(fetchedAt, timeZone);
    } catch {
        time = timeWords(fetchedAt, undefined);
    }
    return `Checked ${time}`;
}
