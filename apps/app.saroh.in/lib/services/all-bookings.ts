/**
 * All bookings (U11, BKMAllBookings / BKDAllBookings), pure so the screen,
 * its row menu and their tests agree: which bookings each view holds and
 * how many, search and the More filters, the order, the day headings, the
 * word on each row's badge and what its menu offers.
 *
 * Every time is read in the business's zone (Q10, decided 19 Oct), with
 * its short label beside "When": a list of one business's diary has one
 * clock. Imports nothing server-only: the screen is a client component.
 */

import type { StatusTone } from "@/components/shared/lists/status-badge";
import { formatDay } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { firstName } from "@/lib/names";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import {
    canCheckIn,
    hasEnded,
    isInNextWeek,
    needsOutcome,
} from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, localDateOf, whoFor } from "@/lib/services/diary";
import { owes, payText } from "@/lib/services/money-answer";

// ── Views: the chips ───────────────────────────────────────────────────────

/**
 * The views, as chips with counts. The ids are a URL contract (`?view=`):
 * Home and the API link to `/bookings/all?view=outcome`, so "Awaiting
 * payment" keeps the id it had as "To confirm".
 */
export type ViewId =
    "upcoming" | "outcome" | "unconfirmed" | "today" | "week" | "all";

export const VIEWS: readonly { id: ViewId; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "outcome", label: "Needs an outcome" },
    { id: "unconfirmed", label: BOOKING_WORDS.awaitingPayment },
    { id: "today", label: "Today" },
    { id: "week", label: "Next 7 days" },
    { id: "all", label: "All" },
];

/** The view an address names; Upcoming for anything else. */
export function readView(raw: string | null | undefined): ViewId {
    return VIEWS.find((v) => v.id === raw)?.id ?? "upcoming";
}

/**
 * Whether a booking belongs in a view. Upcoming, Today and Next 7 days
 * count only bookings still on; their cancelled ones fold under their day
 * (`foldsIn`). All lists every booking, cancelled included.
 */
export function inView(
    view: ViewId,
    b: DiaryBooking,
    now: number,
    zone: string,
): boolean {
    if (b.status === "CANCELLED") return view === "all";
    return inTime(view, b, now, zone);
}

/** The views whose cancelled bookings fold under their day. */
const FOLDING: readonly ViewId[] = ["upcoming", "today", "week"];

/** A cancelled booking that this view would hold, were it still on. */
export function foldsIn(
    view: ViewId,
    b: DiaryBooking,
    now: number,
    zone: string,
): boolean {
    return (
        b.status === "CANCELLED" &&
        FOLDING.includes(view) &&
        inTime(view, b, now, zone)
    );
}

function inTime(
    view: ViewId,
    b: DiaryBooking,
    now: number,
    zone: string,
): boolean {
    switch (view) {
        case "upcoming":
            return !hasEnded(b, now);
        case "outcome":
            return needsOutcome(b, now);
        case "unconfirmed":
            // Anyone who still has to pay (DEC-273): a hold, a pay link out,
            // or a visit that has ended with money still to take.
            return b.status === "PENDING" || owes(b.pay);
        case "today":
            return (
                localDateOf(b.startAt, zone) ===
                localDateOf(new Date(now), zone)
            );
        case "week":
            return isInNextWeek(b, now);
        case "all":
            return true;
    }
}

/** How many bookings each view holds, of the rows given. */
export function viewCounts(
    rows: readonly DiaryBooking[],
    now: number,
    zone: string,
): Record<ViewId, number> {
    const counts = Object.fromEntries(VIEWS.map((v) => [v.id, 0])) as Record<
        ViewId,
        number
    >;
    for (const b of rows) {
        for (const v of VIEWS) if (inView(v.id, b, now, zone)) counts[v.id]++;
    }
    return counts;
}

/**
 * What a view with nothing in it says, and its way back ("Show all
 * bookings"). Never "No bookings yet": the business has some.
 */
export function emptyView(
    view: ViewId,
    total: number,
): { title: string; line: string } {
    const inAll = `${total} ${total === 1 ? "booking" : "bookings"} in all.`;
    switch (view) {
        case "unconfirmed":
            return {
                title: `Nothing ${BOOKING_WORDS.awaitingPayment.toLowerCase()}`,
                line: "Nobody owes you for a booking. Anyone who still has to pay, at the desk or by link, shows here.",
            };
        case "outcome":
            return {
                title: "Nothing to mark",
                line: `Every booking that has ended is marked ${BOOKING_WORDS.came} or ${BOOKING_WORDS.didntCome}. ${inAll}`,
            };
        case "today":
            return { title: "Nothing booked today", line: inAll };
        case "week":
            return { title: "Nothing in the next 7 days", line: inAll };
        default:
            return { title: "Nothing coming up", line: inAll };
    }
}

// ── Search and More filters ────────────────────────────────────────────────

const digits = (text: string) => text.replace(/\D/g, "");

/** Search by name, phone or service (and email, and who takes it). */
export function matchesSearch(b: DiaryBooking, term: string): boolean {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    const words = [
        whoFor(b),
        b.contact?.email ?? "",
        b.bookerEmail ?? "",
        b.service.name,
        b.staff?.name ?? "",
    ]
        .join(" ")
        .toLowerCase();
    if (words.includes(q)) return true;
    const n = digits(q);
    return n.length >= 3 && digits(b.bookerPhone ?? "").includes(n);
}

/**
 * A booking's standing, as Filters' Status picks it. "Awaiting payment" is
 * the view's job, so Status offers how a visit went instead.
 */
export type StatusPick =
    "CONFIRMED" | "CANCELLED" | "ATTENDED" | "NO_SHOW" | "UNMARKED";

export const STATUS_PICKS: readonly { value: StatusPick; label: string }[] = [
    { value: "CONFIRMED", label: "Booked" },
    { value: "ATTENDED", label: BOOKING_WORDS.came },
    { value: "NO_SHOW", label: BOOKING_WORDS.didntCome },
    { value: "UNMARKED", label: "Not marked" },
    { value: "CANCELLED", label: "Cancelled" },
];

function hasStatus(b: DiaryBooking, pick: StatusPick, now: number): boolean {
    switch (pick) {
        case "CANCELLED":
            return b.status === "CANCELLED";
        case "ATTENDED":
        case "NO_SHOW":
            return b.status !== "CANCELLED" && b.outcome === pick;
        case "UNMARKED":
            return needsOutcome(b, now);
        case "CONFIRMED":
            return b.status === "CONFIRMED" && b.outcome === null;
    }
}

/** "With": nobody on it yet (booked before staff). */
export const UNASSIGNED = "__unassigned";

/** Filters: a service, who takes it, and any of the standings. */
export interface MoreFilters {
    service: string | null;
    staff: string | null;
    statuses: readonly StatusPick[];
}

export const NO_MORE: MoreFilters = {
    service: null,
    staff: null,
    statuses: [],
};

/** How many of Filters' choices narrow the list now. */
export function moreCount(f: MoreFilters): number {
    return (
        (f.service ? 1 : 0) + (f.staff ? 1 : 0) + (f.statuses.length ? 1 : 0)
    );
}

export function matchesMore(
    b: DiaryBooking,
    f: MoreFilters,
    now: number = Date.now(),
): boolean {
    if (f.service && b.service.id !== f.service) return false;
    if (f.staff) {
        const id = b.staff?.id ?? UNASSIGNED;
        if (id !== f.staff) return false;
    }
    if (f.statuses.length && !f.statuses.some((p) => hasStatus(b, p, now))) {
        return false;
    }
    return true;
}

/** The choices Filters offers, from the bookings there are. */
export function moreChoices(rows: readonly DiaryBooking[]): {
    services: { value: string; label: string }[];
    staff: { value: string; label: string }[];
} {
    const services = new Map<string, string>();
    const staff = new Map<string, string>();
    for (const b of rows) {
        services.set(b.service.id, b.service.name);
        staff.set(b.staff?.id ?? UNASSIGNED, b.staff?.name ?? "Nobody yet");
    }
    const sorted = (m: Map<string, string>) =>
        Array.from(m.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    return { services: sorted(services), staff: sorted(staff) };
}

// ── Order and days ─────────────────────────────────────────────────────────

/** Soonest first, or most recent first. */
export type Order = "soonest" | "latest";

/**
 * What each view opens in: the past is read backwards (the latest one to
 * mark first), everything else forwards.
 */
export function defaultOrder(view: ViewId): Order {
    return view === "outcome" ? "latest" : "soonest";
}

export function ordered(
    rows: readonly DiaryBooking[],
    order: Order,
): DiaryBooking[] {
    const sign = order === "soonest" ? 1 : -1;
    return [...rows].sort(
        (a, b) =>
            sign * a.startAt.localeCompare(b.startAt) ||
            a.createdAt.localeCompare(b.createdAt),
    );
}

export interface DayGroup {
    key: string;
    /** "Today · Mon 19 Oct", "Tomorrow · Tue 20 Oct", "Wed 21 Oct". */
    label: string;
    rows: DiaryBooking[];
    /** That day's cancelled bookings, folded under it ("2 cancelled · Show"). */
    cancelled?: DiaryBooking[];
}

/** A day's heading, in the business's zone. */
export function dayLabel(day: LocalDate, today: LocalDate): string {
    const date = formatDay(day, { weekday: "short", today });
    if (day === today) return `Today · ${date}`;
    if (day === addDays(today, 1)) return `Tomorrow · ${date}`;
    if (day === addDays(today, -1)) return `Yesterday · ${date}`;
    return date;
}

/**
 * The rows under day headings, in the order given. Today's bookings that
 * have ended sit under "Earlier today" when today also has some still to
 * come, so the morning's marked rows don't read as what's next.
 */
export function groupByDay(
    rows: readonly DiaryBooking[],
    zone: string,
    now: number,
): DayGroup[] {
    const today = localDateOf(new Date(now), zone);
    const todays = rows.filter((b) => localDateOf(b.startAt, zone) === today);
    const split =
        todays.some((b) => hasEnded(b, now)) &&
        todays.some((b) => !hasEnded(b, now));
    const groups: DayGroup[] = [];
    for (const b of rows) {
        const day = localDateOf(b.startAt, zone);
        const earlier = split && day === today && hasEnded(b, now);
        const key = earlier ? `${day}:earlier` : day;
        const last = groups.at(-1);
        if (last?.key === key) {
            last.rows.push(b);
            continue;
        }
        groups.push({
            key,
            label: earlier ? "Earlier today" : dayLabel(day, today),
            rows: [b],
        });
    }
    return groups;
}

// ── A row ──────────────────────────────────────────────────────────────────

export type RowStatus =
    | "booked"
    | "pending"
    | "came"
    | "didnt"
    | "cancelled"
    | "unmarked"
    | "atVisit";

export const ROW_STATUS: Record<
    RowStatus,
    { label: string; tone: StatusTone }
> = {
    booked: { label: "Booked", tone: "active" },
    pending: { label: BOOKING_WORDS.awaitingPayment, tone: "warning" },
    came: { label: BOOKING_WORDS.came, tone: "success" },
    didnt: { label: BOOKING_WORDS.didntCome, tone: "error" },
    cancelled: { label: "Cancelled", tone: "neutral" },
    unmarked: { label: BOOKING_WORDS.notMarked, tone: "neutral" },
    // Paid at the visit, which is still to come (DEC-273): once it has
    // ended unpaid it is Awaiting payment, beside how it went.
    atVisit: { label: BOOKING_WORDS.paysAtVisit, tone: "active" },
};

/**
 * The payment word a row wears beside how it went (DEC-273): "Awaiting
 * payment" while money is still owed — after the visit, or with a pay link
 * out. Null when its status already says it (a hold) or nothing is owed.
 * Attendance stays its own fact: "Came" and "Awaiting payment" side by side.
 */
export function payBadge(
    b: Pick<DiaryBooking, "pay">,
    status: RowStatus,
): { label: string; tone: StatusTone } | null {
    if (status === "pending" || status === "cancelled") return null;
    return owes(b.pay)
        ? { label: BOOKING_WORDS.awaitingPayment, tone: "warning" }
        : null;
}

/**
 * The word on a row's badge: how it went once marked, "Not marked yet"
 * once it has ended unmarked, "Pays at the visit" for one still to come
 * that is paid at the desk and not yet taken, else how it stands.
 */
export function rowStatus(
    b: Pick<
        DiaryBooking,
        "status" | "outcome" | "endAt" | "paidWith" | "paidAtDesk" | "pay"
    >,
    now: number,
): RowStatus {
    if (b.status === "CANCELLED") return "cancelled";
    if (b.outcome === "ATTENDED") return "came";
    if (b.outcome === "NO_SHOW") return "didnt";
    if (b.status === "PENDING") return "pending";
    if (hasEnded(b, now)) return "unmarked";
    // The one answer (DEC-272); an older API's record of how it is paid.
    const atVisit = b.pay
        ? b.pay.word === "PAYS_AT_VISIT"
        : b.paidWith === "DESK" && !b.paidAtDesk;
    return atVisit ? "atVisit" : "booked";
}

/** What the viewer may do from a row (permissions, never role names). */
export interface RowAbilities {
    /** `booking:write`: mark, move and cancel. */
    book: boolean;
    /** `booking:write` and `invoice:write`: Take ₹X at the desk. */
    take: boolean;
    /** `contact:read`: open the person's page. */
    people: boolean;
}

export type RowAction =
    "arrived" | "take" | "move" | "open" | "person" | "cancel";

/**
 * The row menu, in the boards' order: Mark arrived, Take ₹X, Move to
 * another time, Open the booking, Open {first}'s page, then Cancel
 * booking, last and apart. What can't be done to this booking now, or by
 * this person, isn't offered.
 */
export function rowMenu(
    b: DiaryBooking,
    can: RowAbilities,
    now: number,
): RowAction[] {
    const live = b.status !== "CANCELLED" && !hasEnded(b, now);
    const unmarked = b.outcome === null;
    const items: RowAction[] = [];
    if (can.book && live && unmarked && canCheckIn(b, now)) {
        items.push("arrived");
    }
    if (can.take && b.status !== "CANCELLED" && b.take) items.push("take");
    if (can.book && live && unmarked) items.push("move");
    items.push("open");
    if (can.people && b.contact) items.push("person");
    if (can.book && live) items.push("cancel");
    return items;
}

/**
 * The rows as a viewer who may not read money gets them (DEC-098): no price
 * and no amount to take, only `toTake`. Done in the server read, so the
 * amounts never reach the browser, not only hidden by the Money column.
 */
export function withoutAmounts(rows: readonly DiaryBooking[]): DiaryBooking[] {
    return rows.map(({ take, service, ...b }) => {
        const { priceCents: _price, ...rest } = service;
        return { ...b, service: rest, toTake: b.toTake ?? take != null };
    });
}

/** "Take ₹400", or null when there is nothing to take. */
export function takeLabel(b: DiaryBooking): string | null {
    return b.take
        ? `Take ${formatMoney(b.take.cents, b.service.currency ?? null)}`
        : null;
}

/** "Open Kabir's page". */
export function personLabel(b: DiaryBooking): string {
    const first = firstName(whoFor(b));
    return first ? `Open ${first}'s page` : "Open their page";
}

/** Whether a row asks "Did they come?": ended, not cancelled, unmarked. */
export const asksOutcome = needsOutcome;

// ── Money, cancelled folds, durations ──────────────────────────────────────

/** What a row's Money column says: an amount and where it stands. */
export interface MoneyCell {
    /** "₹600", or null when there is no figure to show. */
    amount: string | null;
    /** "Awaiting payment", "Paid", "Pays at the visit", "Free"; null for "—". */
    note: string | null;
}

/**
 * The Money column, for whoever reads money (`payment:read`, or taking
 * payment at the desk: DEC-098, DEC-274; nobody else is sent an amount).
 * It says the one money answer (DEC-272): the amount that matters — still
 * to take while something is owed, else the price — and the payment word.
 */
export function moneyCell(b: DiaryBooking): MoneyCell {
    const currency = b.service.currency ?? null;
    const pay = b.pay;
    const word = payText(pay, b.packName);
    if (b.status === "CANCELLED") {
        // Whether it went back is on the booking, which the note points to.
        const paid = pay?.paidCents ?? 0;
        return pay?.word === "PAID" && paid > 0
            ? {
                  amount: formatMoney(paid, currency),
                  note: `${word} · refund on the booking`,
              }
            : { amount: null, note: "Nothing was paid" };
    }
    // Free (DEC-261): said in the amount's place, alone: never "—" over it.
    if (pay?.word === "FREE" || (!pay && b.free)) {
        return { amount: BOOKING_WORDS.free, note: null };
    }
    // A pack, a membership, a treatment's order, a course: no amount.
    if (pay && (pay.dueCents ?? null) === null && pay.word !== "PAID") {
        return { amount: null, note: word };
    }
    const owed = pay?.dueCents ?? b.take?.cents ?? 0;
    const cents =
        owed > 0 && pay?.word !== "PAID"
            ? owed
            : (b.service.priceCents ?? null);
    const amount =
        cents !== null && cents > 0 ? formatMoney(cents, currency) : null;
    if (!amount && !word) return { amount: null, note: null };
    return { amount, note: word };
}

/** "2 cancelled", "1 cancelled". */
export function cancelledWord(n: number): string {
    return `${n} cancelled`;
}

/** "45 min", "1 hr", "1 hr 30 min": how long a booking runs. */
export function lengthWord(startAt: string, endAt: string): string {
    return minutesWord(
        Math.round(
            (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
        ),
    );
}

/** "45 min", "1 hr", "1 hr 30 min", from minutes. */
export function minutesWord(mins: number): string {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "Cancelled by customer · 20 Nov" needs who cancelled; we know when. */
export function cancelledLine(
    b: Pick<DiaryBooking, "cancelledAt">,
    zone: string,
): string {
    return b.cancelledAt
        ? `Cancelled · ${formatDay(localDateOf(b.cancelledAt, zone), { year: "never" })}`
        : "Cancelled";
}

// ── Forward date picks ─────────────────────────────────────────────────────

/** A forward pick of Filters' Dates: the API reads it as a custom range. */
export type ForwardPick = "tomorrow" | "next7";

/** The custom range a forward pick means, from today in the business's zone. */
export function forwardRange(
    pick: ForwardPick,
    today: LocalDate,
): { from: string; to: string } {
    return pick === "tomorrow"
        ? { from: addDays(today, 1), to: addDays(today, 1) }
        : { from: today, to: addDays(today, 6) };
}

/** Which forward pick a custom range is, if any. */
export function forwardPickOf(
    range: { date: string | null; from: string | null; to: string | null },
    today: LocalDate,
): ForwardPick | null {
    if (range.date !== "custom") return null;
    for (const pick of ["tomorrow", "next7"] as const) {
        const r = forwardRange(pick, today);
        if (range.from === r.from && range.to === r.to) return pick;
    }
    return null;
}

/**
 * Fold each day's cancelled bookings under that day. A day with only
 * cancelled bookings gets a heading of its own when it lies among the days
 * shown, or past the last of them on the last page (`atEnd`), never before
 * the first (that belongs to an earlier page).
 */
export function withFolds(
    groups: readonly DayGroup[],
    cancelled: readonly DiaryBooking[],
    zone: string,
    now: number,
    atEnd = true,
): DayGroup[] {
    if (cancelled.length === 0) return [...groups];
    const today = localDateOf(new Date(now), zone);
    const dayOf = (g: DayGroup) => g.key.split(":")[0] ?? g.key;
    const days = groups.map(dayOf);
    if (days.length === 0) return [];
    const lo = days.reduce((a, b) => (a < b ? a : b));
    const hi = days.reduce((a, b) => (a > b ? a : b));
    const descending = days.length > 1 && (days[0] ?? "") > (days.at(-1) ?? "");
    const byDay = new Map<string, DiaryBooking[]>();
    for (const b of cancelled) {
        const day = localDateOf(b.startAt, zone);
        const beyondEnd = descending ? day < lo : day > hi;
        const beforeStart = descending ? day > hi : day < lo;
        // Today's cancelled ones always show: "Nobody else today".
        if (day !== today && (beforeStart || (beyondEnd && !atEnd))) continue;
        byDay.set(day, [...(byDay.get(day) ?? []), b]);
    }
    const out = groups.map((g) => ({ ...g }));
    const placed = new Set<string>();
    for (let i = out.length - 1; i >= 0; i--) {
        const g = out[i];
        const day = dayOf(g);
        if (!placed.has(day) && byDay.has(day)) {
            g.cancelled = byDay.get(day);
            placed.add(day);
        }
    }
    for (const [day, rows] of Array.from(byDay.entries())) {
        if (placed.has(day)) continue;
        out.push({
            key: day,
            label: dayLabel(day, today),
            rows: [],
            cancelled: rows,
        });
    }
    return out.sort((a, b) =>
        descending
            ? dayOf(b).localeCompare(dayOf(a))
            : dayOf(a).localeCompare(dayOf(b)),
    );
}

/** What a day's band says when only its cancelled bookings are left. */
export const NOBODY_ELSE_TODAY = "Nobody else today";

/** "1 booking" / "3 bookings", for a day's band. */
export function bookingsWord(n: number): string {
    return `${n} ${n === 1 ? "booking" : "bookings"}`;
}
