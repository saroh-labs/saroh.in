/**
 * The message the merchant sends after booking someone by hand (U8 and
 * U9, Q12): "Send confirmation on WhatsApp", "Send it by SMS" and "Copy
 * message" on the done screen. Saroh sends nothing itself: these open the
 * phone's own app with the words filled in, or copy them.
 */

import { phoneLabel } from "@saroh/block-contract";

import { formatDate, formatTime } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";

/** How the booking is paid, for the message's last line. */
export type MessagePay =
    | { kind: "visit"; amount: string | null }
    | { kind: "link"; amount: string | null; url: string | null }
    | { kind: "paid"; amount: string | null }
    | { kind: "pack" };

export interface BookingMessageInput {
    /** The customer, by full name: "Zara Ahmed". */
    customer: string;
    service: string;
    /** Who they'll see, by name; null for a service nobody takes. */
    withName: string | null;
    startAt: string;
    timeZone: string;
    /** "IST": the zone's short name (Q10); empty to leave it off. */
    zone: string;
    /** The business, as its customers know it; null to leave it off. */
    business: string | null;
    pay: MessagePay;
}

/**
 * "Hi Zara, you're booked for Physio assessment with Meera on Tue 20 Oct
 * at 10:00 am (IST) at Kaya Physio. Pay ₹800 at the visit."
 */
export function bookingMessage(input: BookingMessageInput): string {
    const first = firstName(input.customer) || "there";
    const day = formatDate(input.startAt, input.timeZone, {
        weekday: "short",
    });
    const time = formatTime(input.startAt, input.timeZone);
    const zone = input.zone ? ` (${input.zone})` : "";
    const withWho = input.withName ? ` with ${firstName(input.withName)}` : "";
    const where = input.business ? ` at ${input.business}` : "";
    const booked = `Hi ${first}, you're booked for ${input.service}${withWho} on ${day} at ${time}${zone}${where}.`;
    return [booked, payLine(input.pay)].filter(Boolean).join(" ");
}

function payLine(pay: MessagePay): string {
    switch (pay.kind) {
        case "visit":
            return pay.amount ? `Pay ${pay.amount} at the visit.` : "";
        case "link":
            if (!pay.url) {
                return pay.amount ? `Pay ${pay.amount} before the visit.` : "";
            }
            return pay.amount
                ? `Pay ${pay.amount} here: ${pay.url}`
                : `Pay here: ${pay.url}`;
        case "paid":
            return pay.amount
                ? `We've got your ${pay.amount}, thank you.`
                : "It's paid, thank you.";
        case "pack":
            return "It uses one class from your class pack.";
    }
}

/**
 * The phone's digits with its country code, "919000054321": a number
 * saved without one is read as the field reads it (#1036).
 */
function digitsOf(phone: string | null | undefined): string {
    return phoneLabel(phone).replace(/\D/g, "").replace(/^00/, "");
}

/**
 * WhatsApp with the message ready, to their number when there is one
 * (`wa.me` opens the app on a phone and WhatsApp Web at a desk).
 */
export function whatsAppHref(
    phone: string | null | undefined,
    text: string,
): string {
    const to = digitsOf(phone);
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/**
 * Messages with the text ready. `?&body=` is read by both iPhone and
 * Android, which disagree on `?body=` and `&body=`.
 */
export function smsHref(
    phone: string | null | undefined,
    text: string,
): string {
    const to = digitsOf(phone);
    return `sms:${to ? `+${to}` : ""}?&body=${encodeURIComponent(text)}`;
}
