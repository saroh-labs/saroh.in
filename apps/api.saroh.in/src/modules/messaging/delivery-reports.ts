import type { MessagingSendStatus } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { noteInbound, numberHash } from "./messaging-records";
import type { WalletService } from "./wallet.service";

/**
 * What a WhatsApp delivery report or inbound message changes, whichever
 * provider's webhook brought it (MSG91's or Meta's, DEC-213). The
 * controllers only check trust and read their provider's shape.
 * - A verification send (MessagingSend) is found by its provider id across
 *   businesses: DELIVERED (or READ first) charges the held price once,
 *   FAILED gives it back.
 * - Any other send (MessagingMessage) gets its status and its time.
 * - An inbound message opens the number's 24-hour reply window (stored by
 *   the number's hash, never the number or the words).
 * Statuses only move forward, and each event (the provider's id plus the
 * status) is recorded once it is applied, so a repeat is a no-op.
 */

/** The statuses a report may move a send from: forward only, never back. */
const FROM: Partial<Record<string, MessagingSendStatus[]>> = {
    SENT: ["QUEUED"],
    DELIVERED: ["QUEUED", "SENT"],
    READ: ["QUEUED", "SENT", "DELIVERED"],
    FAILED: ["QUEUED", "SENT"],
};

/** When each status was reached, on a MessagingMessage. */
const STAMP = {
    SENT: "sentAt",
    DELIVERED: "deliveredAt",
    READ: "readAt",
    FAILED: "failedAt",
} as const;

/**
 * A send's status report. `ids` are every id the provider may have given
 * our send (the first is the event's id); `status` is SENT, DELIVERED, READ
 * or FAILED in any case, anything else is ignored; `failureReason` is a
 * short code, never the provider's words.
 */
export async function applyStatus(
    wallet: WalletService,
    report: { ids: string[]; status: string; failureReason?: string },
): Promise<void> {
    const status = report.status.toUpperCase();
    const from = FROM[status];
    const ids = report.ids.filter(Boolean);
    if (!from || ids.length === 0) return;
    const eventId = ids[0];
    if (await seen(eventId, status)) return;
    const failed =
        status === "FAILED"
            ? { failureReason: report.failureReason ?? "undelivered" }
            : {};

    await prisma.messagingMessage.updateMany({
        where: { providerMessageId: { in: ids }, status: { in: from } },
        data: {
            status: status as MessagingSendStatus,
            [STAMP[status as keyof typeof STAMP]]: new Date(),
            ...failed,
        },
    });
    await applyVerificationSend(wallet, ids, status, from, failed);
    await record(eventId, status);
}

/** A number wrote to Saroh's WhatsApp: `e164` as the provider gave it. */
export async function applyInbound(
    eventId: string,
    e164: string,
    at: Date,
): Promise<void> {
    if (!eventId || !e164 || (await seen(eventId, "INBOUND"))) return;
    await noteInbound(numberHash(e164), at);
    await record(eventId, "INBOUND");
}

async function applyVerificationSend(
    wallet: WalletService,
    ids: string[],
    status: string,
    from: MessagingSendStatus[],
    failed: { failureReason?: string },
): Promise<void> {
    const send = await outsideOrgContext(() =>
        prisma.messagingSend.findFirst({
            where: { providerMessageId: { in: ids } },
            select: { id: true, organizationId: true, channel: true },
        }),
    );
    if (!send) return;

    await runInOrgContext(send.organizationId, () =>
        prisma.messagingSend.updateMany({
            where: { id: send.id, status: { in: from } },
            data: { status: status as MessagingSendStatus, ...failed },
        }),
    );

    // SMS reports are status only; the wallet settles each send once.
    if (send.channel !== "WHATSAPP") return;
    if (status === "DELIVERED" || status === "READ") {
        await wallet.debit(send.id);
    } else if (status === "FAILED") {
        await wallet.release(send.id);
    }
}

async function seen(eventId: string, status: string): Promise<boolean> {
    const row = await prisma.messagingWebhookEvent.findUnique({
        where: { eventId_status: { eventId, status } },
        select: { id: true },
    });
    return !!row;
}

/**
 * Written after the event is applied: every step above is idempotent on
 * its own, so a crash before this line only means the repeat runs them
 * again, and a duplicate arriving at once loses here harmlessly.
 */
async function record(eventId: string, status: string): Promise<void> {
    try {
        await prisma.messagingWebhookEvent.create({
            data: { eventId, status },
        });
    } catch (error) {
        if (prismaErrorCode(error) !== "P2002") throw error;
    }
}
