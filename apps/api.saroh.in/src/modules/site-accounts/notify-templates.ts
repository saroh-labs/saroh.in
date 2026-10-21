import type { NoticeTemplate } from "../communications/transactional";
import type { BookingNoticeKind, BookingNoticeVars } from "./notices/booking";
import { noticeWhen } from "./notices/notice";

/**
 * What a notice about a customer's own booking, order or waitlist place
 * says (round-2 A14, R15). Each kind's words now live in its own file under
 * `notices/` (U2 #1133), registered in `notices/index.ts`; this module is
 * the stable door to them, and keeps the team's side (`teamNotice`).
 *
 * A thread message is plain text and never rendered as HTML (A13); the
 * email escapes everything a person or the business typed. Times are the
 * business's, never the server's.
 */

export type NoticeKind = NoticeTemplate;

export { backLink, noticeSentence, renderNotice, withLink } from "./notices";
export type { NoticeVars } from "./notices";
export type { BookingNoticeVars } from "./notices/booking";
export { noticeWhen } from "./notices/notice";
export { orderNoticeKind } from "./notices/order";
export type {
    NoticeStage,
    OrderNoticeVars,
    PlacedOrderVars,
} from "./notices/order";
export type { WaitlistNoticeVars } from "./notices/waitlist";

/**
 * The team's inbox line when the customer did it themselves (R15's other
 * side; the design's "‹Business› has been told"): a title and a body.
 */
export function teamNotice(
    kind: Exclude<BookingNoticeKind, "BOOKING_LAPSED">,
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
