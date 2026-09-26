/**
 * The customer's booking page (U19): what the public API answers, narrowed
 * rather than cast (#264), and the words and numbers the page draws from it.
 * Pure — no React, no fetch — so every rule here is tested on its own.
 */

/** A service as the booking page offers it. */
export interface BookingService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    kind: "one" | "class";
    capacity: number;
    priceCents: number | null;
    currency: string | null;
    online: boolean;
    /** Who takes it, by display name. */
    staff: string[];
}

export interface BookingRules {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
}

/** What the page opens with: `GET /public/sites/:siteId/booking`. */
export interface BookingPageData {
    businessName: string;
    /** False when the business has switched Appointments off. */
    open: boolean;
    timezone: string;
    /** Pay now is on offer: Payments on and a provider connected. */
    payOnline: boolean;
    rules: BookingRules;
    services: BookingService[];
}

/** A start: a free one-to-one time, or a class session with places left. */
export interface BookingStart {
    startAt: string;
    endAt: string;
    staffId: string | null;
    staffName: string | null;
    placesLeft: number | null;
}

export interface BookingDay {
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    open: boolean;
    starts: BookingStart[];
}

/** One service's next two weeks: `GET /public/services/:id/days`. */
export interface BookingDays {
    timezone: string;
    kind: "one" | "class";
    capacity: number;
    days: BookingDay[];
}

export type HoldState = "HELD" | "CONFIRMED" | "RELEASED" | "CANCELLED";

/** The booker's own booking, as `POST .../book` answers. */
export interface BookResult {
    reference: string;
    startAt: string;
    endAt: string;
    serviceName: string;
    online: boolean;
    meetingUrl: string | null;
    state: HoldState;
    holdExpiresAt: string | null;
    payToken: string | null;
}

/** Where a pay-now hold stands: `GET /public/services/holds/:token`. */
export interface HoldView {
    state: HoldState;
    holdExpiresAt: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
const strOrNull = (v: unknown) => v === null || isStr(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const isInstant = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v));
const HOLD_STATES = ["HELD", "CONFIRMED", "RELEASED", "CANCELLED"];

function isService(v: unknown): v is BookingService {
    return (
        isObj(v) &&
        isStr(v.id) &&
        isStr(v.name) &&
        strOrNull(v.description) &&
        isNum(v.durationMinutes) &&
        (v.kind === "one" || v.kind === "class") &&
        isNum(v.capacity) &&
        numOrNull(v.priceCents) &&
        strOrNull(v.currency) &&
        typeof v.online === "boolean" &&
        Array.isArray(v.staff) &&
        v.staff.every(isStr)
    );
}

export function isBookingPage(v: unknown): v is BookingPageData {
    if (!isObj(v) || !isObj(v.rules)) return false;
    const r = v.rules;
    return (
        isStr(v.businessName) &&
        typeof v.open === "boolean" &&
        isStr(v.timezone) &&
        typeof v.payOnline === "boolean" &&
        numOrNull(r.bookAheadDays) &&
        numOrNull(r.latestBookingMinutes) &&
        numOrNull(r.freeCancelHours) &&
        Array.isArray(v.services) &&
        v.services.every(isService)
    );
}

function isStart(v: unknown): v is BookingStart {
    return (
        isObj(v) &&
        isInstant(v.startAt) &&
        isInstant(v.endAt) &&
        strOrNull(v.staffId) &&
        strOrNull(v.staffName) &&
        numOrNull(v.placesLeft)
    );
}

export function isBookingDays(v: unknown): v is BookingDays {
    return (
        isObj(v) &&
        isStr(v.timezone) &&
        (v.kind === "one" || v.kind === "class") &&
        isNum(v.capacity) &&
        Array.isArray(v.days) &&
        v.days.every(
            (d: unknown) =>
                isObj(d) &&
                isStr(d.date) &&
                /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
                typeof d.open === "boolean" &&
                Array.isArray(d.starts) &&
                d.starts.every(isStart),
        )
    );
}

export function isBookResult(v: unknown): v is BookResult {
    return (
        isObj(v) &&
        isStr(v.reference) &&
        isInstant(v.startAt) &&
        isInstant(v.endAt) &&
        isStr(v.serviceName) &&
        HOLD_STATES.includes(v.state as string) &&
        (v.holdExpiresAt === null || isInstant(v.holdExpiresAt)) &&
        strOrNull(v.payToken)
    );
}

export function isHoldView(v: unknown): v is HoldView {
    return (
        isObj(v) &&
        HOLD_STATES.includes(v.state as string) &&
        (v.holdExpiresAt === null || isInstant(v.holdExpiresAt))
    );
}

// ── Words and numbers ────────────────────────────────────────────────────

/**
 * "₹800", "₹1,250" — whole amounts without paise, as the design writes a
 * price; paise when there are some. `priceCents` is always amount × 100.
 */
export function formatMoney(
    cents: number | null,
    currency: string | null,
    locale = "en-IN",
): string | null {
    if (cents === null || !currency) return null;
    const whole = cents % 100 === 0;
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: whole ? 0 : 2,
            maximumFractionDigits: whole ? 0 : 2,
        }).format(cents / 100);
    } catch {
        return null;
    }
}

/** "Karan", "Karan or Vikram", "Asha, Karan or Vikram". */
export function orList(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}`;
}

/** "60 min · one-to-one · with Karan or Vikram". */
export function serviceLine(service: BookingService): string {
    const kind =
        service.kind === "class"
            ? `class of ${service.capacity}`
            : "one-to-one";
    const parts = [`${service.durationMinutes} min`, kind];
    if (service.staff.length > 0) parts.push(`with ${orList(service.staff)}`);
    return parts.join(" · ");
}

/** "07:00" — a wall-clock time in the business's zone. */
export function timeIn(iso: string, zone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: zone,
    }).format(new Date(iso));
}

/** The local hour of an instant in the zone, 0–23. */
function hourIn(iso: string, zone: string): number {
    return Number(timeIn(iso, zone).slice(0, 2));
}

/** A `YYYY-MM-DD` as a date at noon UTC, so no zone moves its day. */
function civil(date: string): Date {
    return new Date(`${date}T12:00:00Z`);
}

/** "Fri", "18" — a day button's two lines. */
export function dayParts(date: string): { dow: string; n: string } {
    const d = civil(date);
    return {
        dow: new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            timeZone: "UTC",
        }).format(d),
        n: String(d.getUTCDate()),
    };
}

/** "18 Sep" — and "Fri 18 Sep" with the weekday. */
export function dateText(date: string, withDay = false): string {
    const d = civil(date);
    const day = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    })
        .format(d)
        .replace("Sept", "Sep");
    if (!withDay) return day;
    const dow = new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        timeZone: "UTC",
    }).format(d);
    return `${dow} ${day}`;
}

/** "Monday 21 September" — the heading over a day's times. */
export function dayHeading(date: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    }).format(civil(date));
}

/** The calendar date of an instant in the zone, `YYYY-MM-DD`. */
export function dateIn(iso: string, zone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: zone,
    }).format(new Date(iso));
}

/**
 * What a day button says under its date: how many times are free, or Full
 * (it is open and all taken), or Closed (nobody works then). On a phone the
 * count stands alone and Closed shortens to Shut.
 */
export function dayCountLabel(day: BookingDay, phone: boolean): string {
    const n = day.starts.length;
    if (n > 0) return phone ? String(n) : `${n} free`;
    if (day.open) return "Full";
    return phone ? "Shut" : "Closed";
}

/** The screen-reader name of a day button. */
export function dayAria(day: BookingDay): string {
    const n = day.starts.length;
    const what = n
        ? `${n} ${n === 1 ? "time" : "times"} free`
        : day.open
          ? "full"
          : "closed";
    return `${dateText(day.date, true)}: ${what}`;
}

export interface SlotGroup {
    label: "Morning" | "Afternoon" | "Evening";
    starts: BookingStart[];
}

/** Morning (before noon), Afternoon (to 5pm), Evening — empty ones dropped. */
export function groupStarts(starts: BookingStart[], zone: string): SlotGroup[] {
    const groups: [SlotGroup["label"], number, number][] = [
        ["Morning", 0, 12],
        ["Afternoon", 12, 17],
        ["Evening", 17, 24],
    ];
    return groups
        .map(([label, from, to]) => ({
            label,
            starts: starts.filter((s) => {
                const h = hourIn(s.startAt, zone);
                return h >= from && h < to;
            }),
        }))
        .filter((g) => g.starts.length > 0);
}

/** "12 hours", "1 day", "30 minutes". */
export function describeMinutes(minutes: number): string {
    if (minutes % 1440 === 0) {
        const d = minutes / 1440;
        return `${d} ${d === 1 ? "day" : "days"}`;
    }
    if (minutes % 60 === 0) {
        const h = minutes / 60;
        return `${h} ${h === 1 ? "hour" : "hours"}`;
    }
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * The business's rules, as the summary card says them: "Free to cancel
 * until 12 hours before the start. Bookings open 21 days ahead and close 2
 * hours before." Only the rules it has; empty when it has none.
 */
export function rulesText(rules: BookingRules): string {
    const out: string[] = [];
    if (rules.freeCancelHours !== null) {
        out.push(
            `Free to cancel until ${describeMinutes(rules.freeCancelHours * 60)} before the start.`,
        );
    }
    const ahead =
        rules.bookAheadDays !== null
            ? `open ${describeMinutes(rules.bookAheadDays * 1440)} ahead`
            : null;
    const close =
        rules.latestBookingMinutes !== null
            ? `close ${describeMinutes(rules.latestBookingMinutes)} before`
            : null;
    if (ahead && close) out.push(`Bookings ${ahead} and ${close}.`);
    else if (ahead) out.push(`Bookings ${ahead}.`);
    else if (close) out.push(`Bookings ${close}.`);
    return out.join(" ");
}

/**
 * The confirmation's closing line. Saroh sends no message, so there is no
 * "link in your confirmation" to point at: changes go through the business.
 */
export function changeText(business: string, rules: BookingRules): string {
    const free =
        rules.freeCancelHours !== null
            ? ` Free to cancel until ${describeMinutes(rules.freeCancelHours * 60)} before the start.`
            : "";
    return `Need to change it? Get in touch with ${business}.${free}`;
}

/** "Places left" words for a class session. */
export function placesText(left: number): string {
    if (left <= 0) return "Full";
    return `${left} ${left === 1 ? "place" : "places"} left`;
}

export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Ten digits or more, if a phone is given at all. */
export function phoneProblem(value: string): string | null {
    const digits = value.replace(/\D/g, "");
    if (value.trim() === "") return null;
    return digits.length >= 10 ? null : "A phone number needs 10 digits.";
}

/**
 * The booking as a calendar file the booker can add. Times in UTC, so any
 * calendar puts it at the right hour wherever the phone is.
 */
export function buildIcs(input: {
    reference: string;
    title: string;
    startAt: string;
    endAt: string;
    description: string;
    now?: Date;
}): string {
    const stamp = (iso: string | Date) =>
        new Date(iso)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "");
    const escape = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Saroh//Booking//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${input.reference}@bookings.saroh.app`,
        `DTSTAMP:${stamp(input.now ?? new Date())}`,
        `DTSTART:${stamp(input.startAt)}`,
        `DTEND:${stamp(input.endAt)}`,
        `SUMMARY:${escape(input.title)}`,
        `DESCRIPTION:${escape(input.description)}`,
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ].join("\r\n");
}
