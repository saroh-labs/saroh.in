import { replyToAddress } from "../communications/providers/saroh-email.sender";
import type { RenderedMessage } from "../communications/transactional";
import { escapeHtml } from "../communications/transactional";
import type { BookingNoticeVars, NoticeVars } from "./notify-templates";
import { renderNotice } from "./notify-templates";
import { cleanBusinessName } from "./sender-name";

/**
 * A booking notice as Saroh sends it for a business with no email of its
 * own (DEC-086). Saroh's address carries it, so it holds only Saroh's
 * words and names cleaned as the sender's display name is
 * (`cleanBusinessName`: no links, addresses, domains or control
 * characters, at most 40 characters): the business, the service and the
 * person it is with, in the subject and the body alike. Then a footer says
 * who sent it and how to reach the business.
 *
 * Pure, so every word is tested.
 */

/** What the footer needs to know about the business. */
export interface SarohSender {
    /** Stands in when nothing of the business's name survives cleaning. */
    fallbackName: string;
    /** `BusinessProfile.contactEmail`: replies go there when it's one clean address. */
    contactEmail: string | null;
    /** `BusinessProfile.phone`, E.164. */
    phone: string | null;
}

/** What stands in for a service name that is nothing but a link. */
const SERVICE_FALLBACK = "booking";

/** A booking notice's names, cleaned for Saroh's address. */
export function cleanBookingVars(
    booking: BookingNoticeVars,
    fallbackName: string,
): BookingNoticeVars {
    const staff = booking.staff ? cleanBusinessName(booking.staff, "") : "";
    return {
        ...booking,
        business: cleanBusinessName(booking.business, fallbackName),
        service: cleanBusinessName(booking.service, SERVICE_FALLBACK),
        staff: staff === "" ? null : staff,
    };
}

/** Who sent it and how to reach the business: Saroh's words only. */
export function sarohFooter(business: string, sender: SarohSender): string {
    const name = escapeHtml(business);
    // "Rye & Co." ends its own sentence: no second full stop.
    const reach = replyToAddress(sender.contactEmail)
        ? `Reply to this email to reach ${name}${name.endsWith(".") ? "" : "."}`
        : `To reach ${name}, message them from your account on their site${
              sender.phone ? ` or call ${escapeHtml(sender.phone)}` : ""
          }.`;
    return `<p>Sent for ${name} by Saroh. ${reach}</p>`;
}

/**
 * The email Saroh sends for a booking notice, or null for any other
 * notice (only booking notices go this way).
 */
export function renderSarohNotice(
    vars: NoticeVars,
    sender: SarohSender,
): RenderedMessage | null {
    if (
        vars.kind !== "BOOKING_CONFIRMED" &&
        vars.kind !== "BOOKING_MOVED" &&
        vars.kind !== "BOOKING_CANCELLED"
    ) {
        return null;
    }
    const booking = cleanBookingVars(vars.booking, sender.fallbackName);
    const words = renderNotice({ kind: vars.kind, booking });
    return {
        subject: words.subject,
        body: `${words.body}\n${sarohFooter(booking.business, sender)}`,
    };
}
