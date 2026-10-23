import { formatClock, formatDay } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type {
    HomeTileBookings,
    HomeTileNext,
    HomeTiles,
    HomeUnavailable,
} from "./service";

/**
 * Home A's four tiles (DEC-171, Home plan U6, board `HAPageD`): Bookings
 * today, To pack or hand over, Money in today and Came, in words. The API
 * sends each only to someone who may read it, and only when its read
 * worked (`home-tiles.ts`); this says them.
 *
 * - A tile the person may not read is not drawn (a Member has three).
 * - A tile whose read failed is drawn with a dash and says why (`HAFailedD`),
 *   never as zero; the notice at the top names the part.
 * - Zero is said in words: "None", "Nothing", "All orders are on their way"
 *   (`HAQuietD`); a business with nothing yet says what will show
 *   (`HAGettingSetUpD`).
 *
 * Pure, so it is tested without a page.
 */

export type TileKey = "bookings" | "toPack" | "moneyIn" | "came";

export interface TileView {
    key: TileKey;
    label: string;
    /** The figure; null draws the absent dash (a read that failed, no one to mark). */
    value: string | null;
    /** What the dash means, to a screen reader. */
    absent?: "Not known" | "None";
    sub: string;
    href: string;
    /** The currency Money in today is in, for its icon. */
    currency?: string;
}

/** Which unavailable part each tile is read from (`home.service.ts`). */
const FAILED_BY: Record<TileKey, readonly string[]> = {
    bookings: ["Today", "Schedule"],
    toPack: ["Open orders"],
    moneyIn: ["Money in today"],
    came: ["Today"],
};

/** Where a tile whose read failed opens: its screen, unfiltered. */
const FAILED_HREF: Record<TileKey, string> = {
    bookings: "/calendar",
    toPack: "/commerce/orders",
    moneyIn: "/billing/invoices",
    came: "/bookings",
};

const COULDNT: Record<TileKey, string> = {
    bookings: "Couldn't check bookings",
    toPack: "Couldn't check orders",
    moneyIn: "Couldn't check payments",
    came: "Couldn't check bookings",
};

const LABEL: Record<TileKey, string> = {
    bookings: "Bookings today",
    toPack: "To pack or hand over",
    moneyIn: "Money in today",
    came: "Came",
};

function failed(key: TileKey, unavailable: readonly HomeUnavailable[]) {
    return unavailable.some((u) => FAILED_BY[key].includes(u.label));
}

function failedTile(key: TileKey): TileView {
    return {
        key,
        label: LABEL[key],
        value: null,
        absent: "Not known",
        sub: COULDNT[key],
        href: FAILED_HREF[key],
    };
}

/** "Wed 21 Oct, 10:00 am", or "11:30 am" on `today`. */
function when(next: HomeTileNext, today: string | null): string {
    const clock = formatClock(next.time);
    if (today && next.date === today) return clock;
    const day = formatDay(next.date, {
        weekday: "short",
        year: "never",
        relative: true,
        ...(today ? { today } : {}),
    });
    return `${day}, ${clock}`;
}

/**
 * "Next at 11:30 am, Sourdough basics", "First at 10:00 am, …" before
 * anything has started today, and "Next: Wed 21 Oct, 10:00 am, …" when
 * nothing is left today.
 */
export function bookingsSub(b: HomeTileBookings, today: string | null): string {
    const { next } = b;
    if (!next)
        return b.count > 0 ? "Nothing else booked today" : "Nothing booked yet";
    const at = when(next, today);
    if (!today || next.date !== today) return `Next: ${at}, ${next.what}`;
    // Nothing of today's has started: the next is the first.
    const first = b.laterToday === b.count - 1;
    return `${first ? "First" : "Next"} at ${at}, ${next.what}`;
}

function bookingsTile(
    b: HomeTileBookings,
    today: string | null,
    fresh: boolean,
): TileView {
    if (b.count === 0 && fresh && !b.next) {
        return {
            key: "bookings",
            label: LABEL.bookings,
            value: "None yet",
            sub: "Share your booking page to get the first",
            href: b.href,
        };
    }
    return {
        key: "bookings",
        label: LABEL.bookings,
        value: b.count > 0 ? String(b.count) : "None",
        sub: bookingsSub(b, today),
        href: b.href,
    };
}

/** "Kavya is next, at 12:00 pm"; "First at 10:00 am" before anyone is due. */
export function cameSub(c: NonNullable<HomeTiles["came"]>): string {
    if (!c.next) {
        return c.came > 0
            ? "Everyone due today is marked"
            : "No one else is due today";
    }
    const clock = formatClock(c.next.time);
    if (c.came === 0 && c.due === 0) return `First at ${clock}`;
    const name = c.next.person?.split(" ")[0];
    return name ? `${name} is next, at ${clock}` : `The next is at ${clock}`;
}

/**
 * The tiles to draw, in the boards' order. `today` is the business's date
 * ("2026-10-19"), so a next booking on another day says which.
 */
export function tileViews({
    tiles,
    unavailable,
    today,
    fresh,
}: {
    tiles: HomeTiles | null;
    unavailable: readonly HomeUnavailable[];
    today: string | null;
    /** Nothing sold, booked or paid yet (`lastDay.fresh`). */
    fresh: boolean;
}): TileView[] {
    if (!tiles) return [];
    const out: TileView[] = [];

    if (tiles.bookingsToday) {
        out.push(bookingsTile(tiles.bookingsToday, today, fresh));
    } else if (failed("bookings", unavailable)) {
        out.push(failedTile("bookings"));
    }

    const pack = tiles.toPack;
    if (pack) {
        const none = pack.count === 0;
        out.push({
            key: "toPack",
            label: LABEL.toPack,
            value: none
                ? fresh && pack.inProgress === 0
                    ? "None yet"
                    : "Nothing"
                : count(pack.count, "order"),
            sub: none
                ? pack.inProgress > 0
                    ? "All orders are on their way"
                    : fresh
                      ? "Orders show here as they come in"
                      : "No orders to send"
                : pack.dueToday > 0
                  ? `${pack.dueToday} due today`
                  : pack.late > 0
                    ? `${pack.late} late`
                    : "Due by tomorrow",
            href: pack.href,
        });
    } else if (failed("toPack", unavailable)) {
        out.push(failedTile("toPack"));
    }

    const money = tiles.moneyIn;
    if (money) {
        const totals = money.totals.filter((t) => t.amountMinor !== 0);
        out.push({
            key: "moneyIn",
            label: LABEL.moneyIn,
            value:
                totals.length > 0
                    ? totals
                          .map((t) => formatMoney(t.amountMinor, t.currency))
                          .join(" + ")
                    : fresh
                      ? "Nothing yet"
                      : "Nothing",
            sub:
                money.payments > 0
                    ? `${count(money.payments, "payment")} so far today`
                    : fresh
                      ? "Payments show here as they come in"
                      : "No payments yet today",
            href: money.href,
            currency: totals[0]?.currency ?? money.totals[0]?.currency,
        });
    } else if (failed("moneyIn", unavailable)) {
        out.push(failedTile("moneyIn"));
    }

    if (tiles.came) {
        const c = tiles.came;
        out.push({
            key: "came",
            label: LABEL.came,
            value: `${c.came} of ${c.total}`,
            sub: cameSub(c),
            href: c.href,
        });
    } else if (tiles.bookingsToday) {
        // Bookings are read, and nobody is booked one to one today: there
        // is no one to mark, said with the dash (`HAQuietD`).
        out.push({
            key: "came",
            label: LABEL.came,
            value: null,
            absent: "None",
            sub: fresh ? "Shows once people book" : "No bookings to mark today",
            href: "/bookings",
        });
    } else if (failed("came", unavailable)) {
        out.push(failedTile("came"));
    }

    return out;
}

/**
 * The next booking, as a sentence for an empty day (`HAQuietD`): "Next:
 * Wednesday 21 Oct at 10:00 am, Sourdough basics." Null with none.
 */
export function nextBookingSentence(
    bookings: HomeTileBookings | undefined,
    today: string | null,
    lead = "Next",
): string | null {
    const next = bookings?.next;
    if (!next) return null;
    const day =
        today && next.date === today
            ? "today"
            : formatDay(next.date, {
                  weekday: "long",
                  year: "never",
                  relative: "lower",
                  ...(today ? { today } : {}),
              });
    return `${lead}: ${day} at ${formatClock(next.time)}, ${next.what}.`;
}
