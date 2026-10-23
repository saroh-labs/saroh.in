/**
 * The customer's booking page (U19): what the public API answers, narrowed
 * rather than cast (#264), and the words and numbers the page draws from it.
 * Pure — no React, no fetch — so every rule here is tested on its own.
 */

import { clockParts, clockValue } from "../lib/clock";
import type { GstOnPrice } from "../lib/gst-price";
import {
    browsePriceWords,
    gstOnPriceOf,
    gstPriceWords,
} from "../lib/gst-price";
import { siteMoney } from "../lib/money";
import type { NoticeReach } from "../lib/told";
import type { PayInstructions } from "../pay-instructions/model";

/** Where a service happens (E7): the customer chooses for EITHER. */
export type ServiceWhere = "IN_PERSON" | "ONLINE" | "EITHER";

/** Where one booking happens: the answer to Where. */
export type BookingWhere = "IN_PERSON" | "ONLINE";

/** A service as the booking page offers it. */
export interface BookingService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    kind: "one" | "class";
    capacity: number;
    /** The price the business typed, × 100. */
    priceCents: number | null;
    currency: string | null;
    /**
     * What one booking costs to pay, GST and all, worked out by the
     * server: more than `priceCents` when GST is added on top. Null with
     * no price; absent from an API older than the page, where the price
     * is what is paid.
     */
    payCents?: number | null;
    /**
     * The GST in or on the price, for the words beside it; null when
     * there is none to say. Absent from an older API.
     */
    gst?: GstOnPrice | null;
    /**
     * What paying the deposit takes at booking (E8), worked out by the
     * server as a share of the amount to pay, or null when the service
     * takes none. Absent from an API older than the page: no deposit.
     */
    depositCents?: number | null;
    /**
     * How many visits one booking of it is (E10). More than one is a
     * treatment: sold whole, with visit 1 booked here and the rest booked
     * with the business. Absent from an API older than the page: one.
     */
    visits?: number;
    /** Online only. */
    online: boolean;
    /**
     * Where it happens (E7). Absent from an API older than the page: then
     * it is online when `online` says so, else in person.
     */
    where?: ServiceWhere;
    /** Who takes it, by display name. */
    staff: string[];
}

export interface BookingRules {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
    /**
     * The business's refund policy (E30, DEC-058): money paid online goes
     * back on its own when cancelled in time. Absent from an older API: on.
     */
    refundInTimeCancels?: boolean;
    /**
     * How people pay when they book (DEC-088): online only, at the desk
     * only, or both. Absent from an older API: both.
     */
    bookingPayment?: BookingPayment;
}

/** How the business lets people pay when they book (DEC-088). */
export type BookingPayment = "ONLINE" | "DESK" | "BOTH";

/** The rules' way to pay; absent or unknown reads as both, as before. */
export function bookingPaymentOf(rules: BookingRules): BookingPayment {
    const way = rules.bookingPayment;
    return way === "ONLINE" || way === "DESK" ? way : "BOTH";
}

/** What the page opens with: `GET /public/sites/:siteId/booking`. */
export interface BookingPageData {
    businessName: string;
    /** False when the business has switched Appointments off. */
    open: boolean;
    /**
     * Online booking is paused (DEC-095): the business has had all the
     * online bookings its plan takes this month. Said before the form,
     * naming no plan. Absent from an older API: not paused.
     */
    paused?: boolean;
    timezone: string;
    /**
     * Pay now is on offer: the business allows it (DEC-088), Payments is on
     * and a provider is connected.
     */
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
    /**
     * A service offered either way: set when this start can be had only
     * one way — online outside the business's opening hours (DEC-087).
     */
    only?: BookingWhere;
}

export interface BookingDay {
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    open: boolean;
    /**
     * The business itself is closed that day (UX-054): a closure, or no
     * opening hours that day. Absent from an older API: not known.
     */
    closed?: boolean;
    starts: BookingStart[];
}

/** One service's two weeks: `GET /public/services/:id/days`. */
export interface BookingDays {
    timezone: string;
    kind: "one" | "class";
    capacity: number;
    days: BookingDay[];
    /**
     * Who takes a one-to-one, when each has their own times: the page
     * offers "With: Anyone" or one of them when there is more than one.
     * Absent from an older API.
     */
    staff?: BookingPerson[];
}

/** A person who takes a service: a display name and an opaque id. */
export interface BookingPerson {
    id: string;
    name: string;
}

/** How many days the page shows at a time. */
export const DAYS_WINDOW = 14;
/** The furthest "Show later dates" goes: the API's own cap. */
export const MAX_DAYS_SKIP = 70;

/**
 * Where "Show later dates" goes from a window starting `skip` days from
 * today, or null when there is nothing later to show: past the business's
 * own book-ahead rule nothing can be booked, and the API stops at twelve
 * weeks.
 */
export function laterSkip(
    skip: number,
    bookAheadDays: number | null,
): number | null {
    const next = skip + DAYS_WINDOW;
    if (next > MAX_DAYS_SKIP) return null;
    if (bookAheadDays !== null && next > bookAheadDays) return null;
    return next;
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
    /**
     * Booked to pay at the desk (R32): how the business says it can be paid
     * ahead — UPI, bank transfer, a note. Null or absent: none set, or not
     * a desk booking.
     */
    payInstructions?: PayInstructions | null;
    /**
     * How they hear it is booked (the API's notice reach): the booked card
     * says "We've emailed ‹address›" only when an email goes. Absent from
     * an older API, which promises nothing.
     */
    reach?: NoticeReach | null;
}

/** Where a pay-now hold stands: `GET /public/services/holds/:token`. */
export interface HoldView {
    state: HoldState;
    holdExpiresAt: string | null;
    /**
     * The booker's own booking as it stands — once confirmed, with the link
     * to join an online one (E7). Left out when the answer has none.
     */
    booking?: {
        online: boolean;
        meetingUrl: string | null;
    };
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
        // `gst` is narrowed where it is read (`gstOnPriceOf`): anything
        // strange there is no GST said, never a page that won't open.
        (v.payCents === undefined || numOrNull(v.payCents)) &&
        (v.depositCents === undefined || numOrNull(v.depositCents)) &&
        (v.visits === undefined || isNum(v.visits)) &&
        typeof v.online === "boolean" &&
        (v.where === undefined ||
            v.where === "IN_PERSON" ||
            v.where === "ONLINE" ||
            v.where === "EITHER") &&
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
        (v.paused === undefined || typeof v.paused === "boolean") &&
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
        numOrNull(v.placesLeft) &&
        (v.only === undefined ||
            v.only === null ||
            v.only === "IN_PERSON" ||
            v.only === "ONLINE")
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
                (d.closed === undefined || typeof d.closed === "boolean") &&
                Array.isArray(d.starts) &&
                d.starts.every(isStart),
        ) &&
        (v.staff === undefined ||
            (Array.isArray(v.staff) &&
                v.staff.every(
                    (p: unknown) => isObj(p) && isStr(p.id) && isStr(p.name),
                )))
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
        (v.holdExpiresAt === null || isInstant(v.holdExpiresAt)) &&
        (v.booking === undefined ||
            (isObj(v.booking) &&
                typeof v.booking.online === "boolean" &&
                strOrNull(v.booking.meetingUrl)))
    );
}

// ── Where, and what the team should know (E7) ────────────────────────────

/** The longest note the page takes: the API refuses more (default 110). */
export const MAX_INTAKE_NOTE = 1000;

/** Where a service happens, from an API that may predate `where`. */
export function serviceWhere(service: BookingService): ServiceWhere {
    return service.where ?? (service.online ? "ONLINE" : "IN_PERSON");
}

/** Only a service offered either way asks Where. */
export function asksWhere(service: BookingService | null): boolean {
    return !!service && serviceWhere(service) === "EITHER";
}

/** The two answers to Where: at the business, or a video call. */
export function whereLabel(where: BookingWhere, business: string): string {
    return where === "ONLINE" ? "Video call" : `At ${business}`;
}

/**
 * Where a booking happens, as the confirmation says it: "At Kavi Dental"
 * or "Video call". Only for a business that also works online — one that
 * only ever meets in person has nothing to tell apart — else null.
 */
export function whereText(
    service: BookingService,
    booking: { online: boolean },
    services: BookingService[],
    business: string,
): string | null {
    const mixed = services.some((s) => serviceWhere(s) !== "IN_PERSON");
    if (!mixed) return null;
    if (booking.online || serviceWhere(service) === "ONLINE") {
        return whereLabel("ONLINE", business);
    }
    return whereLabel("IN_PERSON", business);
}

// ── Paying at booking (U19, E8) ──────────────────────────────────────────

/**
 * How the booker pays: it all now, the deposit now, at the desk, or with a
 * class credit of their own (A10).
 */
export type BookPay = "NOW" | "DEPOSIT" | "DESK" | "CREDIT";

/** One way to pay, as the pay step offers it. */
export interface PayChoice {
    pay: BookPay;
    label: string;
    sub: string;
    /** What it takes at booking, in words: "₹400". */
    amount: string;
    /** A short word beside it: "Included" for a membership's class. */
    tag?: string;
}

// ── A class credit (A10) ─────────────────────────────────────────────────

/**
 * The one credit the API offers a signed-in customer for this class at this
 * time (`GET public/site-accounts/bookings/credit`): a class from their pack,
 * or from their membership's month. The page books with what it was given
 * and never picks one itself.
 */
export type OfferedCredit =
    | {
          kind: "PACK";
          id: string;
          /** The pack's name: "10 classes". */
          name: string;
          left: number;
          /** The last day it can be used, `YYYY-MM-DD`. */
          useBy: string;
      }
    | {
          kind: "MEMBERSHIP";
          id: string;
          /** The plan's name. */
          name: string;
          left: number;
          allowance: number;
          /** When that month's classes start again, `YYYY-MM-DD`. */
          resetsOn: string;
      };

/** The credit read's answer: a credit, or none. */
export interface CreditAnswer {
    credit: OfferedCredit | null;
}

const isDate = (v: unknown) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);

function isCredit(v: unknown): v is OfferedCredit {
    if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !isNum(v.left)) {
        return false;
    }
    if (v.kind === "PACK") return isDate(v.useBy);
    return v.kind === "MEMBERSHIP" && isNum(v.allowance) && isDate(v.resetsOn);
}

export function isCreditAnswer(v: unknown): v is CreditAnswer {
    return isObj(v) && (v.credit === null || isCredit(v.credit));
}

/** "10 classes pack", or "Membership": what the credit comes from. */
function creditSource(credit: OfferedCredit): string {
    if (credit.kind === "MEMBERSHIP") return "Membership";
    return /\bpack$/i.test(credit.name) ? credit.name : `${credit.name} pack`;
}

/**
 * The pay step's "Use 1 credit" (the Pulse Fitness design): listed first
 * and chosen by default, nothing to pay. "10 classes pack · use by 12 Nov",
 * or "Membership · resets 1 Oct" with "Included" beside it.
 */
export function creditChoice(
    credit: OfferedCredit,
    currency: string | null,
): PayChoice {
    const when =
        credit.kind === "PACK"
            ? `use by ${dateText(credit.useBy)}`
            : `resets ${dateText(credit.resetsOn)}`;
    return {
        pay: "CREDIT",
        label: `Use 1 credit (${credit.left} left)`,
        sub: `${creditSource(credit)} · ${when}`,
        amount: formatMoney(0, currency ?? "INR") ?? "₹0",
        ...(credit.kind === "MEMBERSHIP" ? { tag: "Included" } : {}),
    };
}

/**
 * The confirmation's line once a credit paid for the class: "Used 1 credit
 * from your 10 classes pack — 9 left, use by 12 Nov." or "… from your
 * membership — 3 left in October." (the class's month, which may not be
 * this one).
 */
export function creditUsedText(credit: OfferedCredit): string {
    const left = Math.max(0, credit.left - 1);
    const from = creditSource(credit).toLowerCase();
    if (credit.kind === "PACK") {
        return `Used 1 credit from your ${from}. ${left} left, use by ${dateText(credit.useBy)}.`;
    }
    const month = new Intl.DateTimeFormat("en-GB", {
        month: "long",
        timeZone: "UTC",
    }).format(new Date(civil(credit.resetsOn).getTime() - 86_400_000));
    return `Used 1 credit from your ${from}. ${left} left in ${month}.`;
}

/**
 * The ways a service can be paid for, in the order the pay step lists
 * them (the Kavi Dental and Pulse Fitness designs). A service with a
 * deposit is paid online — its deposit, or the whole price — and not at
 * the desk; one whose deposit is the full price is simply paid now. When
 * online can't take it (the business chose the desk only, or has no way
 * to pay online), it is paid at the desk wherever the business allows the
 * desk (DEC-089). Without a deposit: now, when the business takes money
 * online, or at the desk. Only what the business allows (DEC-088): `way`
 * online only drops the desk, at the desk only drops paying online. None
 * when nothing it allows can be taken — online only, with no way to pay
 * online — and none for a service with no price.
 */
export function payChoices(
    service: BookingService,
    payOnline: boolean,
    business: string,
    way: BookingPayment = "BOTH",
): PayChoice[] {
    // Every amount here is what is paid, GST and all: the API's sum.
    const toPay = payCentsOf(service);
    const price = formatMoney(toPay, service.currency);
    if (!price || !toPay || toPay <= 0) return [];
    const online = payOnline && way !== "DESK";
    const atDesk = way !== "ONLINE";
    const isClass = service.kind === "class";
    // A treatment is paid for whole (E10): "for all 3 visits".
    const visits = visitsOf(service);
    const forAll = visits > 1 ? ` for all ${visits} visits` : "";
    const payNow: PayChoice = {
        pay: "NOW",
        label: isClass
            ? `Pay ${price} for this class`
            : `Pay ${price}${forAll} now`,
        sub: "Online, booked straight away",
        amount: price,
    };
    const words = laterWords(service, business);
    const desk: PayChoice = {
        pay: "DESK",
        label: words.label,
        sub: words.sub,
        amount: price,
    };
    const deposit = service.depositCents ?? null;
    if (deposit !== null && deposit > 0) {
        // Online can't take it: the desk, where the business allows it
        // (DEC-089); under online only it can't be booked here.
        if (!online) return atDesk ? [desk] : [];
        if (deposit >= toPay) return [payNow];
        const part = formatMoney(deposit, service.currency) ?? "";
        const rest = restAfterDeposit(service) ?? "";
        return [
            {
                pay: "DEPOSIT",
                label: `Pay ${part} deposit now`,
                sub: `The rest (${rest}) at ${business}. Refunded if you cancel in time.`,
                amount: part,
            },
            {
                ...payNow,
                label: `Pay the full ${price}${forAll} now`,
                sub: "Online, in one payment",
            },
        ];
    }
    return [...(online ? [payNow] : []), ...(atDesk ? [desk] : [])];
}

/**
 * The words for paying after booking, by where the service happens. A
 * service customers attend in person is paid "at the desk", when they
 * arrive. One that is online only has no desk to pay at: it is paid
 * "later", to the business directly. (A service offered either way keeps
 * the desk's words: the page doesn't know, when it offers the choice,
 * which way this booking will be had.)
 */
export interface LaterWords {
    /** The pay step's choice, and the summary's line: "Pay at the desk". */
    label: string;
    /** Under the choice. */
    sub: string;
    /** The button: "Book and pay at the desk". */
    confirm: string;
}

export function laterWords(
    service: Pick<BookingService, "online"> | null | undefined,
    business: string,
): LaterWords {
    return service?.online
        ? {
              label: "Pay later",
              sub: `Held for you. Pay ${business} directly.`,
              confirm: "Book and pay later",
          }
        : {
              label: "Pay at the desk",
              sub: "Held for you. Pay when you arrive.",
              confirm: "Book and pay at the desk",
          };
}

/**
 * What the booked card says is still to pay: at the front desk for a visit
 * in person, to the business directly for one held online.
 */
export function payLaterText(
    price: string,
    online: boolean,
    business: string,
): string {
    return online
        ? `Pay ${price} to ${business} directly.`
        : `Pay ${price} at the front desk when you arrive.`;
}

/**
 * Why a priced service can't be booked here at all, or null when it can
 * (E8, DEC-088, DEC-089, #822): the business takes payment only online,
 * and there is no way to pay online now — no provider connected, or
 * Payments off. The page then shows this and no payment line. Under Both
 * or At the desk it never applies: a deposit online can't take is paid at
 * the desk.
 */
export function unpayableText(
    service: BookingService | null,
    payOnline: boolean,
    business: string,
    way: BookingPayment = "BOTH",
): string | null {
    if (!service) return null;
    if (payChoices(service, payOnline, business, way).length > 0) return null;
    if (!service.priceCents || service.priceCents <= 0) return null;
    return (service.depositCents ?? 0) > 0
        ? `${business} can't take the deposit online right now. Get in touch with them to book.`
        : `${business} can't take payment online right now. Get in touch with them to book.`;
}

/**
 * What is left to pay at the visit after the deposit (E8): "₹400", or null
 * when nothing is.
 */
export function restAfterDeposit(service: BookingService): string | null {
    const deposit = service.depositCents ?? null;
    const toPay = payCentsOf(service);
    if (deposit === null || !toPay) return null;
    if (deposit >= toPay) return null;
    // Two amounts the API worked out: what is paid, less the deposit.
    return formatMoney(toPay - deposit, service.currency);
}

// ── GST on the price ─────────────────────────────────────────────────────

/**
 * What one booking of the service costs to pay: the API's amount, GST and
 * all, or the price itself from an API that sends none.
 */
export function payCentsOf(service: BookingService): number | null {
    return service.payCents ?? service.priceCents;
}

/**
 * The price with its GST, before paying and on the confirmation: "₹1,000,
 * includes ₹152.54 GST (18%)" or "₹1,000 + ₹180 GST (18%)". Null when the
 * API said none: nothing is said about GST.
 */
export function serviceGstWords(service: BookingService | null): string | null {
    const gst = gstOnPriceOf(service?.gst);
    return gst && service?.currency
        ? gstPriceWords(gst, service.currency)
        : null;
}

/**
 * A service's price where it is only being picked: the price the business
 * typed, with "+ GST" after it when GST comes on top.
 */
export function servicePickPrice(service: BookingService): string | null {
    const price = formatMoney(service.priceCents, service.currency);
    return price === null
        ? null
        : browsePriceWords(price, gstOnPriceOf(service.gst)?.mode === "ADDED");
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
    return siteMoney(cents / 100, currency, locale);
}

/** "Karan", "Karan or Vikram", "Asha, Karan or Vikram". */
export function orList(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}`;
}

// ── Visits (E10) ─────────────────────────────────────────────────────────

/** How many visits one booking of the service is: 1 unless a treatment. */
export function visitsOf(service: BookingService | null): number {
    const n = service?.visits ?? 1;
    return Number.isInteger(n) && n > 1 ? n : 1;
}

/**
 * The summary's "Then" for a treatment (the Kavi Dental design): "We'll
 * book visits 2 and 3 with you at the first visit". Null for one
 * visit.
 */
export function laterVisitsText(visits: number): string | null {
    if (visits <= 1) return null;
    const which =
        visits === 2
            ? "visit 2"
            : visits === 3
              ? "visits 2 and 3"
              : `visits 2 to ${visits}`;
    return `We'll book ${which} with you at the first visit`;
}

/** The confirmation's word on a treatment: "Visit 1 of 3. We'll book the rest with you then". */
export function firstVisitText(visits: number): string | null {
    return visits > 1
        ? `Visit 1 of ${visits}. We'll book the rest with you then`
        : null;
}

/** "60 min · one-to-one · with Karan or Vikram"; "3 visits of 60 min · …". */
export function serviceLine(service: BookingService): string {
    const kind =
        service.kind === "class"
            ? `class of ${service.capacity}`
            : "one-to-one";
    const visits = visitsOf(service);
    const length =
        visits > 1
            ? `${visits} visits of ${service.durationMinutes} min`
            : `${service.durationMinutes} min`;
    const parts = [length, kind];
    if (service.staff.length > 0) parts.push(`with ${orList(service.staff)}`);
    return parts.join(" · ");
}

/**
 * "07:00", a wall-clock time in the business's zone as a 24-hour value: a
 * `?start=` in an address and what it is matched against. Never drawn. What
 * a customer reads is `timeWords` ("7:00 am", `lib/clock.ts`).
 */
export function timeIn(iso: string, zone: string): string {
    return clockValue(iso, zone);
}

/** The local hour of an instant in the zone, 0–23. */
function hourIn(iso: string, zone: string): number {
    return clockParts(iso, zone).hour;
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
 * (it is open and all taken), Closed (the business is closed that day), or
 * No times (it is open, but nobody takes this service then) — UX-054: never
 * Closed on a day the header says it's open. On a phone the count stands
 * alone; the words are the same on both.
 */
export function dayCountLabel(day: BookingDay, phone: boolean): string {
    const n = day.starts.length;
    if (n > 0) return phone ? String(n) : `${n} free`;
    if (day.open) return "Full";
    return day.closed ? "Closed" : "No times";
}

/** The screen-reader name of a day button. */
export function dayAria(day: BookingDay): string {
    const n = day.starts.length;
    const what = n
        ? `${n} ${n === 1 ? "time" : "times"} free`
        : day.open
          ? "full"
          : day.closed
            ? "closed"
            : "no times";
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
 * hours before." Only the rules it has; empty when it has none. Paying
 * online with a business that doesn't refund on its own (DEC-058), it says
 * so.
 */
export function rulesText(rules: BookingRules, payingOnline = false): string {
    const out: string[] = [];
    if (rules.freeCancelHours !== null) {
        out.push(
            `Free to cancel until ${describeMinutes(rules.freeCancelHours * 60)} before the start.`,
        );
    }
    const kept = keptText(rules, payingOnline);
    if (kept) out.push(kept);
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
 * The business's refund policy, said only where it takes money from the
 * customer: paying online with a business that doesn't refund a cancel on
 * its own (E30, DEC-058). Null otherwise, so the default reads as before.
 */
function keptText(rules: BookingRules, payingOnline: boolean): string | null {
    return payingOnline && rules.refundInTimeCancels === false
        ? "What you pay online isn't refunded automatically if you cancel."
        : null;
}

/** The words after "Need to change it? …": the free-cancel window and refund policy. */
export function changeRules(rules: BookingRules, paidOnline = false): string {
    const free =
        rules.freeCancelHours !== null
            ? ` Free to cancel until ${describeMinutes(rules.freeCancelHours * 60)} before the start.`
            : "";
    const kept = keptText(rules, paidOnline);
    return `${free}${kept ? ` ${kept}` : ""}`;
}

/** Where a signed-in booker moves or cancels it (UX-055). */
export const MOVE_OR_CANCEL = "Move or cancel it from your bookings";

/**
 * The confirmation's closing line. Saroh sends no message, so there is no
 * "link in your confirmation" to point at. A booking made signed in (every
 * booking since A9) is moved or cancelled from the booker's own bookings
 * (UX-055); `movable` false — no account to go to — says to get in touch.
 */
export function changeText(
    business: string,
    rules: BookingRules,
    paidOnline = false,
    movable = false,
): string {
    const how = movable
        ? `${MOVE_OR_CANCEL} on ${business}'s website.`
        : `Get in touch with ${business}.`;
    return `Need to change it? ${how}${changeRules(rules, paidOnline)}`;
}

/** "Places left" words for a class session. */
export function placesText(left: number): string {
    if (left <= 0) return "Full";
    return `${left} ${left === 1 ? "place" : "places"} left`;
}

export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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

/**
 * The booking as a link that opens Google Calendar with it filled in, for
 * the customer who keeps their diary there. Times in UTC, as the calendar
 * file's are. Nothing is sent to anyone until they press Save there.
 */
export function googleCalendarHref(input: {
    title: string;
    startAt: string;
    endAt: string;
    description: string;
    /** Where it happens, when the page knows. */
    location?: string | null;
}): string {
    const stamp = (iso: string) =>
        new Date(iso)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "");
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: input.title,
        dates: `${stamp(input.startAt)}/${stamp(input.endAt)}`,
        details: input.description,
    });
    if (input.location?.trim()) params.set("location", input.location.trim());
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * How many sessions are on show: what "Show more" has opened, and never
 * fewer than reach the chosen one, so a session chosen by the address (a
 * waitlist claim link, #1149) is always in the list it is chosen from.
 */
export function sessionsOnShow(
    sessions: readonly { startAt: string }[],
    shown: number,
    chosenStartAt: string | null | undefined,
): number {
    const at = chosenStartAt
        ? sessions.findIndex((s) => s.startAt === chosenStartAt)
        : -1;
    return Math.max(shown, at + 1);
}
