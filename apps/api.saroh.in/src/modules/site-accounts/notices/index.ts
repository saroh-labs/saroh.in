import type {
    NoticeTemplate,
    RenderedMessage,
} from "../../communications/transactional";
import {
    escapeHtml,
    SECRET_LINK_SLOT,
} from "../../communications/transactional";
import type { CustomerNotifyPayload } from "../customer-notify-queue";
import { autopayFailedNotice } from "./autopay-failed";
import { backInStockNotice } from "./back-in-stock";
import { bookingNotice } from "./booking";
import { courseNotice } from "./course";
import { enquiryReceivedNotice } from "./enquiry-received";
import { membershipNotice } from "./membership";
import type { NoticeDefinition, NoticeSubject, NoticeVarsBase } from "./notice";
import { safeLink } from "./notice";
import { orderStepNotice, placedOrderNotice } from "./order";
import { orderDeliveryNotice } from "./order-delivery";
import { refundSentNotice } from "./refund";
import { teamReplyNotice } from "./thread-reply";
import { waitlistNotice } from "./waitlist";

/**
 * The customer notices `customer.notify` sends (DEC-174, U2 #1133): each
 * kind (a `NOTICE_TEMPLATES` value) and the file that says what it is.
 *
 * **Adding a notice:** a file beside this one with `defineNotice` (what it
 * is about, its sentence, subject line, links and switch), its kind in
 * `NOTICE_TEMPLATES` (`communications/transactional.ts`), and one line
 * below, in alphabetical order. Nothing else: the handler, the email's
 * layout, the once-per-event key, the contact's reach and consent are the
 * same for every kind. `index.spec.ts` fails for a template with no entry,
 * and for a notice naming a switch whose `NOTICE_SENDS` line
 * (`notice-settings.ts`) isn't flipped to true in the same commit.
 */
export const NOTICES = {
    AUTOPAY_FAILED: autopayFailedNotice,
    BACK_IN_STOCK: backInStockNotice,
    BOOKING_CANCELLED: bookingNotice,
    BOOKING_CONFIRMED: bookingNotice,
    BOOKING_LAPSED: bookingNotice,
    BOOKING_MOVED: bookingNotice,
    // Courses and classes (U17, #1148).
    COURSE_CANCELLED: courseNotice,
    COURSE_ENROLLED: courseNotice,
    WAITLIST_CLASS_CANCELLED: waitlistNotice,
    ENQUIRY_RECEIVED: enquiryReceivedNotice,
    MEMBERSHIP_CANCELLED: membershipNotice,
    MEMBERSHIP_JOINED: membershipNotice,
    MEMBERSHIP_KEPT: membershipNotice,
    MEMBERSHIP_PAUSED: membershipNotice,
    MEMBERSHIP_PLAN_CHANGED: membershipNotice,
    MEMBERSHIP_RESUMED: membershipNotice,
    ORDER_HANDED_OVER: orderStepNotice,
    ORDER_PLACED: placedOrderNotice,
    ORDER_READY: orderStepNotice,
    // Delivery updates (U16, #1147).
    ORDER_DELIVERED: orderDeliveryNotice,
    ORDER_SENT: orderDeliveryNotice,
    ORDER_TRACKING: orderDeliveryNotice,
    REFUND_SENT: refundSentNotice,
    THREAD_REPLY: teamReplyNotice,
    WAITLIST_OFFER: waitlistNotice,
} as const satisfies Record<NoticeTemplate, NoticeDefinition<NoticeVarsBase>>;

type VarsOf<D> = D extends NoticeDefinition<infer V> ? V : never;

/** Any notice's values, as its own file defines them. */
export type NoticeVars = {
    [K in NoticeTemplate]: VarsOf<(typeof NOTICES)[K]>;
}[NoticeTemplate];

/** The definition for a kind. */
export function noticeDefinition(
    kind: NoticeTemplate,
): NoticeDefinition<NoticeVars> {
    // Each entry takes the values of its own kinds, and the kind picked it.
    return NOTICES[kind];
}

/** Read what a notice is about, now; null: nobody is told. */
export function loadNotice(
    tx: Parameters<NoticeDefinition<NoticeVars>["load"]>[0],
    organizationId: string,
    payload: CustomerNotifyPayload,
    now: Date = new Date(),
): Promise<NoticeSubject<NoticeVars> | null> {
    return noticeDefinition(payload.kind).load(
        tx,
        organizationId,
        payload,
        now,
    );
}

/** The sentence the customer's thread gets. Plain text. */
export function noticeSentence(vars: NoticeVars): string {
    return noticeDefinition(vars.kind).sentence(vars);
}

/**
 * The link back from an email to what it is about, with the words above
 * it; null for a notice that has none, or whose address isn't a web one.
 */
export function backLink(
    vars: NoticeVars,
): { lead: string; url: string } | null {
    const line = noticeDefinition(vars.kind).backLink?.(vars) ?? null;
    const url = safeLink(line?.url);
    return line && url ? { lead: line.lead, url } : null;
}

/** The notice with its link back, on the kinds whose email carries one. */
export function withLink(vars: NoticeVars, link: string | null): NoticeVars {
    const def = noticeDefinition(vars.kind);
    return link && def.withLink ? def.withLink(vars, link) : vars;
}

/** The email: subject and HTML body, everything typed escaped. */
export function renderNotice(vars: NoticeVars): RenderedMessage {
    const def = noticeDefinition(vars.kind);
    const { business, firstName } = def.names(vars);
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
    // The notice's own links (a courier's tracking page), then the way
    // back to it on the business's own site.
    const back = backLink(vars);
    const links = [
        ...(def.links?.(vars) ?? []).flatMap((line) => {
            const url = safeLink(line.url);
            return url ? [{ lead: line.lead, url }] : [];
        }),
        ...(back ? [back] : []),
    ];
    // A secret link (a fresh pay link) is a slot here, filled in only when
    // the send job hands the email to the provider.
    const secret = def.secretLink
        ? `<p>${escapeHtml(def.secretLink.lead(vars))}<br><a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a></p>`
        : null;
    // Words they wrote, quoted back as plain text (the enquiry reply).
    const quote = def.quote?.(vars) ?? null;
    // A list under the lead (a course's sessions).
    const list = def.list?.(vars) ?? null;
    const body = [
        `<p>${greeting}</p>`,
        `<p>${escapeHtml(def.sentence(vars))}</p>`,
        ...(secret ? [secret] : []),
        ...(list && list.items.length > 0
            ? [
                  `<p>${escapeHtml(list.lead)}</p>`,
                  `<ul>${list.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
              ]
            : []),
        ...(quote
            ? [
                  `<p>${escapeHtml(quote.lead)}</p>`,
                  `<blockquote>${escapeHtml(quote.text).replace(/\r?\n/g, "<br>")}</blockquote>`,
              ]
            : []),
        ...links.map(
            (l) =>
                `<p>${escapeHtml(l.lead)}<br><a href="${escapeHtml(l.url)}">${escapeHtml(l.url)}</a></p>`,
        ),
        `<p>${escapeHtml(business)}</p>`,
    ].join("\n");
    return { subject: def.subject(vars), body };
}
