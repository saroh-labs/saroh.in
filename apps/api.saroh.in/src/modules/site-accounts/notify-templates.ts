import { dayWords, isTimeZone, timeWords } from "../../common/words-format";
import type {
    NoticeTemplate,
    RenderedMessage,
} from "../communications/transactional";
import { escapeHtml } from "../communications/transactional";

/**
 * What a notice about a customer's own booking, order or waitlist place
 * says (round-2 A14, R15), in the business's voice: the sentence its SYSTEM
 * message in the customer's thread carries, the email the business's own
 * provider sends, and the line the team's inbox gets when the customer did
 * it themselves.
 *
 * Pure, so every word is tested. A thread message is plain text and never
 * rendered as HTML (A13); the email escapes everything a person or the
 * business typed. Times are the business's, never the server's.
 */

export type NoticeKind = NoticeTemplate;

export interface BookingNoticeVars {
    business: string;
    /** "Asha", or null when the booker gave no name. */
    firstName: string | null;
    service: string;
    /** The person it is with, when it has one. */
    staff: string | null;
    startAt: Date;
    /** Where a move took it from. */
    fromStartAt: Date | null;
    timeZone: string;
    /** The customer did it themselves, from their account or the site. */
    byCustomer: boolean;
    /**
     * Given to someone else (#1157): "now with Meera", and the time only
     * when it moved too (`fromStartAt` differs from `startAt`).
     */
    reassigned?: boolean;
    /**
     * Their bookings on the business's own site, where they can move or
     * cancel it (`notice-link.ts`); null or absent: the email has no link.
     */
    link?: string | null;
}

/** The order steps a customer is told about. */
export type NoticeStage = "READY" | "HANDED_TO_COURIER" | "OUT_FOR_DELIVERY";

export interface OrderNoticeVars {
    business: string;
    firstName: string | null;
    /** The order's number as the business shows it ("ORD-1019"). */
    number: string;
    stage: NoticeStage;
    /** Collected by the customer: Ready means "ready for pick-up". */
    pickup: boolean;
    courier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
}

/** A website order the customer just placed (UX-042). */
export interface PlacedOrderVars {
    business: string;
    firstName: string | null;
    number: string;
    /** How it reaches them (`OrderFulfilment`): collected, delivered, … */
    fulfilment: string;
    /** Paid when it is handed over, not online. */
    payOnHandover: boolean;
    /**
     * The order's own page on the business's site (`notice-link.ts`); null
     * or absent: the email has no link.
     */
    link?: string | null;
}

export interface WaitlistNoticeVars {
    business: string;
    firstName: string | null;
    service: string;
    startAt: Date;
    /** Until when the place is held for them. */
    heldUntil: Date;
    timeZone: string;
}

export type NoticeVars =
    | {
          kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED";
          booking: BookingNoticeVars;
      }
    | { kind: "ORDER_PLACED"; placed: PlacedOrderVars }
    | { kind: "ORDER_READY" | "ORDER_HANDED_OVER"; order: OrderNoticeVars }
    | { kind: "WAITLIST_OFFER"; waitlist: WaitlistNoticeVars };

/** Which notice an order step is, or null for a step nobody is told. */
export function orderNoticeKind(stage: string): NoticeKind | null {
    if (stage === "READY") return "ORDER_READY";
    if (stage === "HANDED_TO_COURIER" || stage === "OUT_FOR_DELIVERY") {
        return "ORDER_HANDED_OVER";
    }
    return null;
}

/** "Tue 6 Oct at 11:00 am", in the business's zone. */
export function noticeWhen(at: Date, timeZone: string): string {
    const zone = safeZone(timeZone);
    return `${dayWords(at, zone, { weekday: true })} at ${timeWords(at, zone)}`;
}

function safeZone(timeZone: string): string {
    return isTimeZone(timeZone) ? timeZone : "Asia/Kolkata";
}

/** The sentence the customer's thread gets. Plain text. */
export function noticeSentence(vars: NoticeVars): string {
    switch (vars.kind) {
        case "BOOKING_CONFIRMED":
        case "BOOKING_MOVED":
        case "BOOKING_CANCELLED":
            return bookingSentence(vars.kind, vars.booking);
        case "ORDER_PLACED":
            return placedSentence(vars.placed);
        case "ORDER_READY":
        case "ORDER_HANDED_OVER":
            return orderSentence(vars.kind, vars.order);
        case "WAITLIST_OFFER": {
            const w = vars.waitlist;
            return `A place opened in ${w.service} on ${noticeWhen(w.startAt, w.timeZone)}. It's held for you until ${noticeWhen(w.heldUntil, w.timeZone)}.`;
        }
    }
}

function bookingSentence(
    kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED",
    b: BookingNoticeVars,
): string {
    const when = noticeWhen(b.startAt, b.timeZone);
    const withWhom = b.staff ? ` with ${b.staff}` : "";
    switch (kind) {
        case "BOOKING_CONFIRMED":
            return `Your ${b.service}${withWhom} on ${when} is booked.`;
        case "BOOKING_MOVED": {
            if (b.reassigned && b.staff) return reassignedSentence(b, when);
            if (b.byCustomer) return `You moved your ${b.service} to ${when}.`;
            const was = b.fromStartAt
                ? ` It was ${noticeWhen(b.fromStartAt, b.timeZone)}.`
                : "";
            return `Your ${b.service}${withWhom} has moved to ${when}.${was}`;
        }
        case "BOOKING_CANCELLED":
            return b.byCustomer
                ? `You cancelled your ${b.service} on ${when}.`
                : `Your ${b.service} on ${when} has been cancelled.`;
    }
}

/**
 * "Your booking is now with Meera" (#1157): "Your Physio assessment on Tue
 * 20 Oct at 10:00 am is now with Meera Iyer.", or, moved too, "… is now
 * with Meera Iyer on Wed 21 Oct at 11:00 am. It was Tue 20 Oct at 10:00 am."
 */
function reassignedSentence(b: BookingNoticeVars, when: string): string {
    const moved =
        b.fromStartAt !== null &&
        b.fromStartAt.getTime() !== b.startAt.getTime();
    if (!moved) return `Your ${b.service} on ${when} is now with ${b.staff}.`;
    const was = b.fromStartAt
        ? ` It was ${noticeWhen(b.fromStartAt, b.timeZone)}.`
        : "";
    return `Your ${b.service} is now with ${b.staff} on ${when}.${was}`;
}

function placedSentence(p: PlacedOrderVars): string {
    const pickup = p.fulfilment === "PICKUP";
    const delivered =
        p.fulfilment === "LOCAL_DELIVERY" || p.fulfilment === "SHIPPING";
    // Only the steps they are told about are promised (`orderNoticeKind`).
    const next = pickup
        ? " We'll tell you when it's ready for pick-up."
        : delivered
          ? " We'll tell you when it's on its way."
          : "";
    if (p.payOnHandover) {
        const pay = pickup
            ? "You pay at pick-up."
            : delivered
              ? "You pay when it's delivered."
              : "You pay when you get it.";
        return `We have your order ${p.number}. ${pay}${next}`;
    }
    return `We have your order ${p.number}, and it's paid.${next}`;
}

function orderSentence(
    kind: "ORDER_READY" | "ORDER_HANDED_OVER",
    o: OrderNoticeVars,
): string {
    if (kind === "ORDER_READY") {
        return o.pickup
            ? `Your order ${o.number} is ready for pick-up.`
            : `Your order ${o.number} is packed and ready to go.`;
    }
    if (o.stage === "OUT_FOR_DELIVERY") {
        return `Your order ${o.number} is out for delivery.`;
    }
    const courier = o.courier ? ` with ${o.courier}` : "";
    const tracking = o.trackingNumber
        ? ` Tracking number: ${o.trackingNumber}.`
        : "";
    return `Your order ${o.number} is on its way${courier}.${tracking}`;
}

/** The email's subject line. Plain text, as a subject is. */
function noticeSubject(vars: NoticeVars): string {
    switch (vars.kind) {
        case "BOOKING_CONFIRMED":
            return `You're booked with ${vars.booking.business}`;
        case "BOOKING_MOVED":
            return vars.booking.reassigned && vars.booking.staff
                ? `Your booking with ${vars.booking.business} is now with ${vars.booking.staff}`
                : `Your booking with ${vars.booking.business} has moved`;
        case "BOOKING_CANCELLED":
            return `Your booking with ${vars.booking.business} is cancelled`;
        case "ORDER_PLACED":
            return `Your order ${vars.placed.number} from ${vars.placed.business}`;
        case "ORDER_READY":
            return vars.order.pickup
                ? `Your order ${vars.order.number} from ${vars.order.business} is ready for pick-up`
                : `Your order ${vars.order.number} from ${vars.order.business} is ready`;
        case "ORDER_HANDED_OVER":
            return `Your order ${vars.order.number} from ${vars.order.business} is on its way`;
        case "WAITLIST_OFFER":
            return `A place opened at ${vars.waitlist.business}`;
    }
}

function businessOf(vars: NoticeVars): string {
    switch (vars.kind) {
        case "ORDER_PLACED":
            return vars.placed.business;
        case "ORDER_READY":
        case "ORDER_HANDED_OVER":
            return vars.order.business;
        case "WAITLIST_OFFER":
            return vars.waitlist.business;
        default:
            return vars.booking.business;
    }
}

function firstNameOf(vars: NoticeVars): string | null {
    switch (vars.kind) {
        case "ORDER_PLACED":
            return vars.placed.firstName;
        case "ORDER_READY":
        case "ORDER_HANDED_OVER":
            return vars.order.firstName;
        case "WAITLIST_OFFER":
            return vars.waitlist.firstName;
        default:
            return vars.booking.firstName;
    }
}

/** Only a web address is ever a link; anything else stays words. */
function safeLink(url: string | null): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:"
            ? parsed.toString()
            : null;
    } catch {
        return null;
    }
}

/**
 * The link back from an email to what it is about, with the words above
 * it; null for a notice that has none, or whose address isn't a web one.
 */
export function backLink(
    vars: NoticeVars,
): { lead: string; url: string } | null {
    if (vars.kind === "ORDER_PLACED") {
        const url = safeLink(vars.placed.link ?? null);
        return url ? { lead: "See your order:", url } : null;
    }
    if (vars.kind === "BOOKING_CONFIRMED" || vars.kind === "BOOKING_MOVED") {
        const url = safeLink(vars.booking.link ?? null);
        return url ? { lead: "See, move or cancel your booking:", url } : null;
    }
    return null;
}

/** The email: subject and HTML body, everything typed escaped. */
export function renderNotice(vars: NoticeVars): RenderedMessage {
    const firstName = firstNameOf(vars);
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
    const link =
        vars.kind === "ORDER_HANDED_OVER" &&
        vars.order.stage === "HANDED_TO_COURIER"
            ? safeLink(vars.order.trackingUrl)
            : null;
    // The way back to it on the business's own site: the order's page, or
    // their bookings.
    const back = backLink(vars);
    const body = [
        `<p>${greeting}</p>`,
        `<p>${escapeHtml(noticeSentence(vars))}</p>`,
        link
            ? `<p>Track it here:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
            : "",
        back
            ? `<p>${escapeHtml(back.lead)}<br><a href="${escapeHtml(back.url)}">${escapeHtml(back.url)}</a></p>`
            : "",
        `<p>${escapeHtml(businessOf(vars))}</p>`,
    ]
        .filter(Boolean)
        .join("\n");
    return { subject: noticeSubject(vars), body };
}

/**
 * The team's inbox line when the customer did it themselves (R15's other
 * side; the design's "‹Business› has been told"): a title and a body.
 */
export function teamNotice(
    kind: "BOOKING_CONFIRMED" | "BOOKING_MOVED" | "BOOKING_CANCELLED",
    who: string,
    b: Pick<
        BookingNoticeVars,
        "service" | "startAt" | "fromStartAt" | "timeZone"
    >,
): { title: string; body: string } {
    const when = noticeWhen(b.startAt, b.timeZone);
    switch (kind) {
        case "BOOKING_CONFIRMED":
            return { title: `${who} booked ${b.service}`, body: `${when}.` };
        case "BOOKING_MOVED":
            return {
                title: `${who} moved their ${b.service}`,
                body: b.fromStartAt
                    ? `Now ${when}. It was ${noticeWhen(b.fromStartAt, b.timeZone)}.`
                    : `Now ${when}.`,
            };
        case "BOOKING_CANCELLED":
            return {
                title: `${who} cancelled their ${b.service}`,
                body: `It was ${when}.`,
            };
    }
}
