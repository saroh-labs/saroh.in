import type { Prisma } from "@saroh/database";

import { ATTENTION_DETAIL_MAX } from "./dto";

/**
 * A booking-page note becomes a Needs attention suggestion (C12, R13).
 *
 * "Anything we should know?" (E7) is kept on the booking. Once that booking
 * is confirmed, the same words wait on the customer's record as a SUGGESTED
 * entry, so staff can check it with them and add it to Needs attention
 * (`ContactAttentionService.confirm`) or set it aside ("Nothing to add",
 * `remove`). The note on the booking is never changed by either.
 *
 * A suggestion is sensitive whatever it says (default 95): only someone who
 * may read sensitive entries sees it, or counts it. It starts as Medical,
 * as the design's confirm card does; staff pick the kind when they add it.
 */

/** The label the confirm card suggests: the note's first words. */
export const SUGGESTED_LABEL_MAX = 40;

/**
 * The note's first clause — up to a full stop, comma, semicolon, bracket or
 * line break — cut to {@link SUGGESTED_LABEL_MAX} characters at a word when
 * it runs over. A note that opens with punctuation falls back to its first
 * words. Never empty for a note that says anything.
 */
export function suggestedLabel(note: string): string {
    const text = note.trim();
    const clause = text.split(/[.,;(\n]/)[0]?.trim() ?? "";
    const words = clause || text;
    const chars = [...words];
    if (chars.length <= SUGGESTED_LABEL_MAX) return words;
    const cut = chars.slice(0, SUGGESTED_LABEL_MAX).join("");
    const space = cut.lastIndexOf(" ");
    return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/**
 * The note as the entry's detail. A note may run to 1,000 characters and a
 * detail to 500, so a longer note is cut with an ellipsis; the whole note
 * stays on the booking for anyone who may read it.
 */
export function suggestedDetail(note: string): string {
    const chars = [...note.trim()];
    if (chars.length <= ATTENTION_DETAIL_MAX) return chars.join("");
    return `${chars
        .slice(0, ATTENTION_DETAIL_MAX - 1)
        .join("")
        .trimEnd()}…`;
}

/** What {@link suggestFromBookingNoteInTx} reads off the booking. */
export interface NotedBooking {
    id: string;
    organizationId: string;
    contactId: string | null;
    status: string;
    intakeNote: string | null;
}

/**
 * On a confirmed booking with a note, write its suggestion — once per
 * booking, so a second confirmation of the same booking adds nothing. A
 * booking still holding its place while the booker pays (PENDING) waits:
 * the payment's confirmation calls this again. Runs on the booking's own
 * transaction, so a booking and its suggestion are made together.
 *
 * Returns whether a suggestion was written.
 */
export async function suggestFromBookingNoteInTx(
    tx: Pick<Prisma.TransactionClient, "contactAttention">,
    booking: NotedBooking,
): Promise<boolean> {
    const note = booking.intakeNote?.trim() ?? "";
    if (booking.status !== "CONFIRMED" || !booking.contactId || !note) {
        return false;
    }
    const already = await tx.contactAttention.findFirst({
        where: {
            organizationId: booking.organizationId,
            bookingId: booking.id,
            source: "BOOKING_PAGE",
        },
        select: { id: true },
    });
    if (already) return false;
    await tx.contactAttention.create({
        data: {
            organizationId: booking.organizationId,
            contactId: booking.contactId,
            kind: "MEDICAL",
            label: suggestedLabel(note),
            detail: suggestedDetail(note),
            sensitive: true,
            source: "BOOKING_PAGE",
            status: "SUGGESTED",
            bookingId: booking.id,
        },
        select: { id: true },
    });
    return true;
}
