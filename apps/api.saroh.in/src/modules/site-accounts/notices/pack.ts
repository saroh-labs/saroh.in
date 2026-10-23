import type { Prisma } from "@saroh/database";

import { dayWords } from "../../../common/words-format";
import { businessTimezone } from "../../bookings/staff-availability";
import { readPackKind } from "../../class-packs/pack-kind";
import { noticeOn } from "../../communications/notice-settings";
import type { CustomerNotifyPayload } from "../customer-notify-queue";
import { enqueueCustomerNotice } from "../customer-notify-queue";
import { defineNotice, firstWord } from "./notice";

/**
 * A pack holder hears they are down to their last class, and that the
 * classes they still have run out in a week (DEC-174 U22, #1153). One
 * switch, PACK_CREDITS, on by default. What was bought is said on the
 * payment's receipt (DEC-173), not here: no second email for a purchase.
 *
 * - **One credit left** is queued by `redeemPackInTx` on the booking's
 *   transaction when a spend leaves exactly one. Its key carries how many
 *   redemptions the purchase has ever had ({@link packLowNoticeKey}): a
 *   class given back and the same booking paid again reuses its row, so it
 *   says nothing twice; a new booking that brings it down to one again is
 *   a new redemption and tells them again.
 * - **Expiring in 7 days** is queued by the `class-packs.expiring` sweep
 *   (`class-packs/pack-expiring.handler.ts`), keyed to the use-by date
 *   ({@link packExpiringNoticeKey}): an extension moves the date, so the
 *   new date gets its own notice a week before it.
 *
 * Both are read again when the job runs: back above one left, nothing
 * left, the date moved since, or already expired, tells nobody.
 */

export const PACK_NOTICE_KINDS = ["PACK_LOW", "PACK_EXPIRING"] as const;
export type PackNoticeKind = (typeof PACK_NOTICE_KINDS)[number];

/** How many days before its use-by date a holder is told. */
export const PACK_EXPIRING_DAYS = 7;

export interface PackNoticeVars {
    business: string;
    firstName: string | null;
    /** The pack's name: "10-class pack". */
    pack: string;
    /** Classes (or sessions) still to use. */
    left: number;
    /** What one credit pays for, by the pack's kind. */
    unit: "class" | "session";
    expiresAt: Date;
    timeZone: string;
}

export interface PackNotice {
    kind: PackNoticeKind;
    pack: PackNoticeVars;
}

/** One credit left: once per redemption that brought it there. */
export function packLowNoticeKey(
    purchaseId: string,
    redemptions: number,
): string {
    return `pack-low:${purchaseId}:${redemptions}`;
}

/** Expiring soon: once per use-by date, so an extension tells again. */
export function packExpiringNoticeKey(
    purchaseId: string,
    expiresAt: Date,
): string {
    return `pack-expiring:${purchaseId}:${expiresAt.toISOString()}`;
}

type Tx = Prisma.TransactionClient;

/**
 * A spend on the purchase's own transaction (its row lock held) left one
 * credit: queue PACK_LOW, unless the business has Pack credits off.
 * Returns whether one was queued.
 */
export async function queuePackLowNotice(
    tx: Tx,
    organizationId: string,
    purchaseId: string,
): Promise<boolean> {
    if (!(await noticeOn(tx, organizationId, "PACK_CREDITS"))) return false;
    const redemptions = await tx.packRedemption.count({
        where: { purchaseId },
    });
    await enqueueCustomerNotice(tx, organizationId, {
        kind: "PACK_LOW",
        eventKey: packLowNoticeKey(purchaseId, redemptions),
        packPurchaseId: purchaseId,
    });
    return true;
}

function isPackKind(kind: string): kind is PackNoticeKind {
    return (PACK_NOTICE_KINDS as readonly string[]).includes(kind);
}

function count(n: number, unit: PackNoticeVars["unit"]): string {
    return `${n} ${n === 1 ? unit : unit === "class" ? "classes" : "sessions"}`;
}

/** "31 Dec 2026", in the business's zone. */
export function packDay(p: PackNoticeVars): string {
    return dayWords(p.expiresAt, p.timeZone, { year: true });
}

/** The account thread's sentence and the email's lead. */
export function packSentence(kind: PackNoticeKind, p: PackNoticeVars): string {
    if (kind === "PACK_LOW") {
        return `You have ${count(p.left, p.unit)} left in your ${p.pack}. Use it by ${packDay(p)}.`;
    }
    const verb = p.left === 1 ? "expires" : "expire";
    return `Your ${count(p.left, p.unit)} in your ${p.pack} ${verb} on ${packDay(p)}. Book before then to use ${p.left === 1 ? "it" : "them"}.`;
}

export const packNotice = defineNotice<PackNotice>({
    setting: "PACK_CREDITS",
    load: (tx, organizationId, payload, now) =>
        loadPack(tx, organizationId, payload, now),
    sentence: ({ kind, pack }) => packSentence(kind, pack),
    subject: ({ kind, pack: p }) =>
        kind === "PACK_LOW"
            ? `You have ${count(p.left, p.unit)} left at ${p.business}`
            : `Your ${p.unit === "class" ? "classes" : "sessions"} at ${p.business} expire on ${packDay(p)}`,
    names: ({ pack }) => ({
        business: pack.business,
        firstName: pack.firstName,
    }),
});

async function loadPack(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
    now: Date,
): Promise<{ contactId: string; vars: PackNotice } | null> {
    const kind = payload.kind;
    if (!isPackKind(kind) || !payload.packPurchaseId) return null;
    const purchase = await tx.packPurchase.findFirst({
        where: { id: payload.packPurchaseId, organizationId },
        select: {
            contactId: true,
            credits: true,
            expiresAt: true,
            pack: { select: { name: true, kind: true } },
            contact: { select: { firstName: true } },
            organization: { select: { name: true } },
            _count: {
                select: { redemptions: { where: { reversedAt: null } } },
            },
        },
    });
    if (!purchase || purchase.expiresAt <= now) return null;
    const left = purchase.credits - purchase._count.redemptions;
    // Where it stands now: a class given back since isn't the last one,
    // and a date moved since is told a week before the new date instead.
    if (kind === "PACK_LOW" && left !== 1) return null;
    if (kind === "PACK_EXPIRING") {
        if (left <= 0) return null;
        if (payload.packExpiresAt !== purchase.expiresAt.toISOString()) {
            return null;
        }
    }
    return {
        contactId: purchase.contactId,
        vars: {
            kind,
            pack: {
                business: purchase.organization.name,
                firstName: firstWord(purchase.contact.firstName),
                pack: purchase.pack.name,
                left,
                unit:
                    readPackKind(purchase.pack.kind) === "ONE_TO_ONE"
                        ? "session"
                        : "class",
                expiresAt: purchase.expiresAt,
                timeZone: await businessTimezone(tx, organizationId),
            },
        },
    };
}
