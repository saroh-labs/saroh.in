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

import type { StatusTone } from "@/components/shared/status-badge";
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

/** Whether a booking belongs in a view. */
export function inView(
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
            return b.status === "PENDING";
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
                line: `Every booking made with a payment link has been paid. ${inAll}`,
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

/** A booking's standing, as More filters' Status picks it. */
export type StatusPick = "CONFIRMED" | "PENDING" | "CANCELLED";

export const STATUS_PICKS: readonly { value: StatusPick; label: string }[] = [
    { value: "CONFIRMED", label: "Booked" },
    { value: "PENDING", label: BOOKING_WORDS.awaitingPayment },
    { value: "CANCELLED", label: "Cancelled" },
];

/** "With": nobody on it yet (booked before staff). */
export const UNASSIGNED = "__unassigned";

/** More filters: a service, who takes it, and any of three standings. */
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

/** How many of More filters narrow the list now. */
export function moreCount(f: MoreFilters): number {
    return (
        (f.service ? 1 : 0) + (f.staff ? 1 : 0) + (f.statuses.length ? 1 : 0)
    );
}

export function matchesMore(b: DiaryBooking, f: MoreFilters): boolean {
    if (f.service && b.service.id !== f.service) return false;
    if (f.staff) {
        const id = b.staff?.id ?? UNASSIGNED;
        if (id !== f.staff) return false;
    }
    if (f.statuses.length && !f.statuses.includes(b.status)) return false;
    return true;
}

/** The choices More filters offers, from the bookings there are. */
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

/** Soonest first, or latest first. */
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
    atVisit: { label: BOOKING_WORDS.paysAtVisit, tone: "neutral" },
};

/**
 * The word on a row's badge: how it went once marked, "Not marked yet"
 * once it has ended unmarked, "Pays at the visit" for one still to come
 * that is paid at the desk and not yet taken, else how it stands.
 */
export function rowStatus(
    b: Pick<
        DiaryBooking,
        "status" | "outcome" | "endAt" | "paidWith" | "paidAtDesk"
    >,
    now: number,
): RowStatus {
    if (b.status === "CANCELLED") return "cancelled";
    if (b.outcome === "ATTENDED") return "came";
    if (b.outcome === "NO_SHOW") return "didnt";
    if (b.status === "PENDING") return "pending";
    if (hasEnded(b, now)) return "unmarked";
    if (b.paidWith === "DESK" && !b.paidAtDesk) return "atVisit";
    return "booked";
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
