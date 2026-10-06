import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { countUsage, windowKey } from "../billing/metering";
import type { MeteringService, PlanRoom } from "../billing/metering.service";
import { planMeter, queueLimitNoticeInTx } from "../billing/metering.service";
import {
    limitLevel,
    limitNoticeKey,
} from "../billing/plan-limit-notice.handler";
import { businessTimezone } from "../bookings/staff-availability";
import type { NoticeVars } from "../site-accounts/notify-templates";
import { renderSarohNotice } from "../site-accounts/saroh-notice";
import type { MessageSendPayload } from "./message-send.handler";
import { MESSAGE_SEND_TYPE } from "./message-send.handler";
import type { NotEmailed } from "./saroh-delivery";
import {
    ALLOWANCE_USED,
    NO_ALLOWANCE,
    SAROH_EMAILS_KEY,
    SAROH_EMAILS_ROW,
    SAROH_PROVIDER,
    SAROH_SEND_ATTEMPTS,
} from "./saroh-delivery";
import type { RenderedMessage } from "./transactional";

type Tx = Prisma.TransactionClient;

/**
 * The Saroh branch of `queueTransactional` (DEC-086): a booking notice for
 * a business with no email of its own, worded for Saroh's address and
 * queued as a `SAROH` delivery. `message.send` honours that stamp (a
 * provider connected meanwhile doesn't send it twice), re-checks the
 * switches, and hands it to Saroh's sender.
 */

/** The Message columns `queueTransactional` has worked out. */
export interface QueuedMessageBase {
    organizationId: string;
    channel: string;
    contactId: string | null;
    toAddress: string;
    subject: string;
    body: string;
    createdByUserId: string | null;
    invoiceId: string | null;
    template: string;
}

/** What a queued (or not emailed) Saroh send returns, as `queueTransactional` does. */
export interface SarohQueued {
    id: string;
    status: "QUEUED" | NotEmailed;
    toAddress: string;
    route: "SAROH";
}

/**
 * The notice as Saroh sends it: names cleaned, Saroh's footer. Reads the
 * business's slug (the name's stand-in), contact email and phone now.
 */
export async function renderForSaroh(
    tx: Pick<Tx, "organization" | "businessProfile">,
    organizationId: string,
    input: { notice: NoticeVars },
): Promise<RenderedMessage> {
    const [org, profile] = await Promise.all([
        tx.organization.findUnique({
            where: { id: organizationId },
            select: { slug: true },
        }),
        tx.businessProfile.findUnique({
            where: { organizationId },
            select: { contactEmail: true, phone: true },
        }),
    ]);
    const words = renderSarohNotice(input.notice, {
        fallbackName: org?.slug ?? "",
        contactEmail: profile?.contactEmail ?? null,
        phone: profile?.phone ?? null,
    });
    if (!words) {
        // Only booking notices reach here (`sarohMaySend`); anything else
        // is a bug, and must not go from Saroh's address.
        throw new Error("Only a booking notice can go through Saroh");
    }
    return words;
}

/** What `queueSarohInTx` throws itself out of the meter with at the cap. */
class AllowanceUsed extends Error {
    constructor() {
        super("Saroh's email allowance is used for this month");
    }
}

/**
 * Message + `SAROH` Delivery + `message.send` job, on the caller's
 * transaction — when this month's allowance has room (U3).
 *
 * The allowance is counted under the plan-meter lock
 * (`MeteringService.roomInTx`), so two notices racing for the last email
 * can't both have it. Nothing escapes into the caller's transaction: at the
 * cap the meter throws a sentinel caught here, and the Message is written
 * ALLOWANCE_USED (no delivery, no job) with the cap's notice queued once a
 * month; with no allowance to count against (the plan read failed, has no
 * row or no number, or the row is off now) it is NO_ALLOWANCE. Either way
 * the thread message the caller wrote stands.
 */
export async function queueSarohInTx(
    tx: Tx,
    organizationId: string,
    base: QueuedMessageBase,
    meter: Pick<MeteringService, "roomInTx" | "enforcedRow"> = planMeter,
    now: Date = new Date(),
): Promise<SarohQueued> {
    const used = new AllowanceUsed();
    let room: PlanRoom | null;
    try {
        room = await meter.roomInTx(tx, organizationId, SAROH_EMAILS_ROW, {
            refuse: () => used,
            now,
        });
    } catch (err) {
        if (err === used) {
            await queueCapNotice(tx, meter, organizationId, now);
            return notEmailed(tx, base, ALLOWANCE_USED);
        }
        // The row turned off since `sarohMaySend` read it (MODULE_LOCKED):
        // thrown before the meter wrote or counted anything.
        if (err instanceof ForbiddenException) {
            return notEmailed(tx, base, NO_ALLOWANCE);
        }
        throw err;
    }
    if (!room) return notEmailed(tx, base, NO_ALLOWANCE);

    const message = await tx.message.create({
        data: { ...base, status: "QUEUED" },
    });
    const delivery = await tx.delivery.create({
        data: {
            organizationId,
            messageId: message.id,
            provider: SAROH_PROVIDER,
            status: "QUEUED",
        },
    });
    const payload: MessageSendPayload = {
        messageId: message.id,
        deliveryId: delivery.id,
    };
    await tx.job.create({
        data: {
            organizationId,
            type: MESSAGE_SEND_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            maxAttempts: SAROH_SEND_ATTEMPTS,
        },
    });
    return {
        id: message.id,
        status: "QUEUED",
        toAddress: base.toAddress,
        route: "SAROH",
    };
}

/** The Message of a notice Saroh didn't email, and why: no delivery, no job. */
async function notEmailed(
    tx: Pick<Tx, "message">,
    base: QueuedMessageBase,
    status: NotEmailed,
): Promise<SarohQueued> {
    const message = await tx.message.create({ data: { ...base, status } });
    return {
        id: message.id,
        status,
        toAddress: base.toAddress,
        route: "SAROH",
    };
}

/**
 * The cap's notice, once a month: queued only when this month's notice for
 * this level and limit hasn't been told yet (`plan.limit.notice` claims it
 * under the same key), so a business at its cap doesn't queue a job for
 * every booking.
 */
async function queueCapNotice(
    tx: Tx,
    meter: Pick<MeteringService, "enforcedRow">,
    organizationId: string,
    now: Date,
): Promise<void> {
    const row = await meter.enforcedRow(organizationId, SAROH_EMAILS_ROW, now);
    if (row?.state !== "on" || row.limit === null) return;
    const count = await countUsage(tx, organizationId, SAROH_EMAILS_KEY, now);
    const level = limitLevel(count, row.limit);
    if (!level) return;
    const zone = await businessTimezone(tx, organizationId);
    const eventKey = limitNoticeKey(
        SAROH_EMAILS_ROW,
        level,
        row.limit,
        windowKey(row.per, now, zone),
    );
    const told = await tx.customerNotice.findUnique({
        where: { organizationId_eventKey: { organizationId, eventKey } },
        select: { id: true },
    });
    if (!told) {
        await queueLimitNoticeInTx(tx, {
            organizationId,
            moduleId: SAROH_EMAILS_ROW,
        });
    }
}
