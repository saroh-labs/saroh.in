import type { Prisma } from "@saroh/database";

import type { ModuleKey } from "../capabilities/module-registry";

/**
 * The business's switches for its automatic customer notices (DEC-174,
 * U1 #1132): one place that says whether a business sends each kind.
 *
 * Pure, as `notifications/alert-preferences.ts` is: the kinds, their
 * defaults, the module each belongs to and the words. The business's own
 * choices are `CustomerNoticeSetting` rows, kept only while a choice
 * differs from the default here, so a switch put back removes its row.
 *
 * Every sender asks {@link noticeOn}, inside its own transaction, the way
 * every thread post asks `accountThreadOn`. Never a gate of a sender's own.
 * The read and the write are `notice-settings.service.ts`.
 *
 * Fixes and the notices that existed before DEC-174 (a booking confirmed,
 * moved or cancelled, an order's steps, the cancel wording, the lapse
 * notice) have no switch here: "Updates in Messages" and the business's
 * email provider stay their controls.
 */

/** The kinds, in the order the workspace lists them. */
export const NOTICE_KINDS = [
    "RENEWAL_INVOICE",
    "AUTOPAY_FAILED",
    "MEMBERSHIP",
    "REFUND",
    "TEAM_REPLY",
    "ENQUIRY_REPLY",
    "ORDER_DELIVERY",
    "COURSE",
    "PACK_CREDITS",
    "BACK_IN_STOCK",
    "OVERDUE_REMINDERS",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export function isNoticeKind(value: unknown): value is NoticeKind {
    return (NOTICE_KINDS as readonly unknown[]).includes(value);
}

/**
 * The defaults: every kind on, except overdue reminders, which a business
 * chooses to send (D3 is opt-in). Code, not rows.
 */
export function defaultOn(kind: NoticeKind): boolean {
    return kind !== "OVERDUE_REMINDERS";
}

/**
 * Whether Saroh sends each kind yet. A kind is not listed until it does,
 * as a kind whose module is off is not: a switch for an email Saroh never
 * sends would do nothing, and the screen would say something untrue.
 *
 * Every kind starts false. The unit that ships a kind's sender (U10 the
 * renewal invoice and failed autopay, U11 memberships, U12 refunds, U14
 * team replies, U15 the enquiry reply, U16 delivery updates, U17 courses,
 * U22 pack credits, U23 back in stock, U20 overdue reminders) flips its
 * own line here, in the same commit as the sender, and nothing else.
 */
export const NOTICE_SENDS: Record<NoticeKind, boolean> = {
    RENEWAL_INVOICE: true,
    AUTOPAY_FAILED: true,
    MEMBERSHIP: true,
    REFUND: false,
    TEAM_REPLY: false,
    ENQUIRY_REPLY: true,
    ORDER_DELIVERY: false,
    COURSE: false,
    PACK_CREDITS: false,
    BACK_IN_STOCK: false,
    OVERDUE_REMINDERS: false,
};

/**
 * The module a kind belongs to, when it has one. A module the business
 * hasn't turned on, or that Saroh hasn't rolled out to it, has no switch
 * at all (DEC-057: never name a module that is off).
 *
 * - Memberships, renewals, autopay and online refunds are Payments'
 *   (Billing › Subscriptions is gated on it).
 * - An enquiry is the CRM's (leads).
 * - Delivery updates and back in stock are the shop's (Commerce).
 * - A team reply goes in the customer's Messages thread, which is not
 *   Communications' (as "Updates in Messages"), and overdue reminders are
 *   about invoices, which every business has (DEC-070): neither has one.
 */
export const NOTICE_MODULE: Record<NoticeKind, ModuleKey | null> = {
    RENEWAL_INVOICE: "PAYMENTS",
    AUTOPAY_FAILED: "PAYMENTS",
    MEMBERSHIP: "PAYMENTS",
    REFUND: "PAYMENTS",
    TEAM_REPLY: null,
    ENQUIRY_REPLY: "CRM",
    ORDER_DELIVERY: "COMMERCE",
    COURSE: "COURSES",
    PACK_CREDITS: "CLASS_PACKS",
    BACK_IN_STOCK: "COMMERCE",
    OVERDUE_REMINDERS: null,
};

/**
 * Kinds offered only while the business has its own email provider
 * connected. The enquiry reply goes to someone who is not yet a customer
 * and has no account thread, so with no provider it reaches nobody.
 */
export const NOTICE_NEEDS_EMAIL: readonly NoticeKind[] = ["ENQUIRY_REPLY"];

/** Why a kind is listed but can't be changed yet. */
export type NoticeUnavailable = "NO_EMAIL";

/** The words for each reason, as the person reads them. */
export const NOTICE_UNAVAILABLE_WORDS: Record<NoticeUnavailable, string> = {
    NO_EMAIL: "Connect your email first",
};

/** What each kind is called, and what it sends, in the merchant's words. */
export const NOTICE_WORDS: Record<NoticeKind, { label: string; says: string }> =
    {
        RENEWAL_INVOICE: {
            label: "Renewal invoices",
            says: "A membership's renewal invoice is sent to the customer when it's made.",
        },
        AUTOPAY_FAILED: {
            label: "Failed autopay charges",
            says: "The customer is told when an autopay charge fails, with a link to pay.",
        },
        MEMBERSHIP: {
            label: "Membership emails",
            says: "Joined, paused, resumed, plan changed, cancelled, and ending in 7 days.",
        },
        REFUND: {
            label: "Refunds",
            says: "The customer is told when a refund is sent online.",
        },
        TEAM_REPLY: {
            label: "Your replies in Messages",
            says: "A reply from your team in the customer's Messages is emailed to them.",
        },
        ENQUIRY_REPLY: {
            label: "Enquiry replies",
            says: "Someone who sends an enquiry is told you got their message, at most once a day per person. It goes even when an automation also emails them.",
        },
        ORDER_DELIVERY: {
            label: "Delivery updates",
            says: "Delivered and Sent, and tracking added after an order is handed over.",
        },
        COURSE: {
            label: "Course emails",
            says: "Enrolled in a course, and an enrolment cancelled.",
        },
        PACK_CREDITS: {
            label: "Pack credits",
            says: "One credit left, and credits expiring in 7 days.",
        },
        BACK_IN_STOCK: {
            label: "Back in stock",
            says: "Customers who asked are emailed once when a sold-out product is back.",
        },
        OVERDUE_REMINDERS: {
            label: "Overdue reminders",
            says: "Up to 2 reminders for an unpaid invoice, 3 and 10 days after it's due.",
        },
    };

/** One stored choice. */
export interface StoredNoticeSetting {
    kind: string;
    enabled: boolean;
}

/** Whether a kind is on: the business's row, else the default. */
export function settingOn(
    stored: readonly StoredNoticeSetting[],
    kind: NoticeKind,
): boolean {
    const row = stored.find((s) => s.kind === kind);
    return row ? row.enabled : defaultOn(kind);
}

/**
 * Whether the business is offered a kind, given what it has on:
 * - `null`: not listed at all, its module being off (DEC-057), or Saroh
 *   not sending it yet ({@link NOTICE_SENDS});
 * - `{ offered: false, why }`: listed, but it can't be changed yet;
 * - `{ offered: true }`: the business chooses.
 */
export function noticeOffer(
    kind: NoticeKind,
    has: { moduleOn: (key: ModuleKey) => boolean; emailConnected: boolean },
): { offered: true } | { offered: false; why: NoticeUnavailable } | null {
    if (!NOTICE_SENDS[kind]) return null;
    const module = NOTICE_MODULE[kind];
    if (module !== null && !has.moduleOn(module)) return null;
    if (NOTICE_NEEDS_EMAIL.includes(kind) && !has.emailConnected) {
        return { offered: false, why: "NO_EMAIL" };
    }
    return { offered: true };
}

/** Anything that can read the switches: `prisma` or a transaction. */
export type NoticeSettingsReader = Pick<
    Prisma.TransactionClient,
    "customerNoticeSetting"
>;

/**
 * Whether this business sends `kind`: its stored choice, else the default.
 *
 * Every sender of a switched notice asks this, and only this, inside its
 * own transaction, so a switch turned off before the commit stops the
 * notice. It says nothing about whether the notice can reach anyone: the
 * provider, consent and the account thread are the send path's, as before.
 */
export async function noticeOn(
    tx: NoticeSettingsReader,
    organizationId: string,
    kind: NoticeKind,
): Promise<boolean> {
    const row = await tx.customerNoticeSetting.findUnique({
        where: { organizationId_kind: { organizationId, kind } },
        select: { enabled: true },
    });
    return row ? row.enabled : defaultOn(kind);
}
