import { createHash, timingSafeEqual } from "node:crypto";

import {
    Body,
    Controller,
    Headers,
    HttpCode,
    Post,
    UnauthorizedException,
} from "@nestjs/common";
import type { MessagingSendStatus } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { env } from "../../env";
import { noteInbound, numberHash } from "./messaging-records";
import { WalletService } from "./wallet.service";

/** The header the owner adds in MSG91's webhook settings, carrying `MSG91_WEBHOOK_SECRET`. */
export const MSG91_SECRET_HEADER = "x-saroh-webhook-secret";

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

interface Msg91Report {
    requestId?: unknown;
    uuid?: unknown;
    eventName?: unknown;
    reason?: unknown;
    direction?: unknown;
    customerNumber?: unknown;
    contentType?: unknown;
    ts?: unknown;
}

/**
 * PUBLIC, platform-level MSG91 WhatsApp webhook (DEC-191, #1243; messaging
 * core, 27 Oct): Saroh's own MSG91 account posts every send's status and
 * every inbound message here, so there is no business in the URL.
 * - A verification send (MessagingSend) is found by its MSG91 id across
 *   businesses: DELIVERED (or READ first) charges the held price once,
 *   FAILED gives it back.
 * - Any other send (MessagingMessage) gets its status and its time.
 * - An inbound message opens the number's 24-hour reply window (stored by
 *   the number's hash, never the number or the words).
 * Statuses only move forward, and each event (MSG91's id plus the status)
 * is recorded once it is applied, so a repeat is a no-op.
 *
 * MSG91 documents no signature, only custom headers sent with every report
 * (https://msg91.com/help/webhook-new/how-to-receive-whatsapp-delivery-reports-via-webhook-new),
 * so trust is one long Saroh secret in a header, checked before the body is read.
 * shortcut: a shared header secret, not a signature; switch if MSG91 adds signing.
 *
 * MSG91 pauses a webhook on a 4xx, so only a bad secret answers one; an
 * unknown id or a body we can't read is a 200 no-op.
 */
@Controller("public/webhooks/msg91")
export class Msg91WebhookController {
    constructor(private readonly wallet: WalletService) {}

    @Post()
    @HttpCode(200)
    async handle(
        @Headers(MSG91_SECRET_HEADER) secret: string | undefined,
        @Body() body: unknown,
    ): Promise<{ ok: true }> {
        if (!secretMatches(secret, env.MSG91_WEBHOOK_SECRET)) {
            throw new UnauthorizedException("Webhook verification failed");
        }
        // One report per recipient, but an array costs nothing to accept.
        for (const report of [body].flat()) await this.apply(report);
        return { ok: true };
    }

    private async apply(report: unknown): Promise<void> {
        if (!report || typeof report !== "object") return;
        const r = report as Msg91Report;
        const uuid = text(r.uuid);
        if (isInbound(r)) {
            const number = text(r.customerNumber);
            if (!uuid || !number || (await this.seen(uuid, "INBOUND"))) return;
            await noteInbound(numberHash(number), inboundAt(r.ts));
            await this.record(uuid, "INBOUND");
            return;
        }

        const status =
            typeof r.eventName === "string" ? r.eventName.toUpperCase() : "";
        const from = FROM[status];
        // Our send stored MSG91's request id (or its message uuid); either matches.
        const ids = [text(r.requestId), uuid].filter(Boolean);
        if (!from || ids.length === 0) return;
        const eventId = ids[0];
        if (await this.seen(eventId, status)) return;

        await prisma.messagingMessage.updateMany({
            where: { providerMessageId: { in: ids }, status: { in: from } },
            data: {
                status: status as MessagingSendStatus,
                [STAMP[status as keyof typeof STAMP]]: new Date(),
                ...(status === "FAILED"
                    ? { failureReason: failureCode(r.reason) }
                    : {}),
            },
        });
        await this.applyVerificationSend(ids, status, from, r.reason);
        await this.record(eventId, status);
    }

    private async applyVerificationSend(
        ids: string[],
        status: string,
        from: MessagingSendStatus[],
        reason: unknown,
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
                data: {
                    status: status as MessagingSendStatus,
                    ...(status === "FAILED"
                        ? { failureReason: failureCode(reason) }
                        : {}),
                },
            }),
        );

        // SMS reports are status only; the wallet settles each send once.
        if (send.channel !== "WHATSAPP") return;
        if (status === "DELIVERED" || status === "READ") {
            await this.wallet.debit(send.id);
        } else if (status === "FAILED") {
            await this.wallet.release(send.id);
        }
    }

    private async seen(eventId: string, status: string): Promise<boolean> {
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
    private async record(eventId: string, status: string): Promise<void> {
        try {
            await prisma.messagingWebhookEvent.create({
                data: { eventId, status },
            });
        } catch (error) {
            if (prismaErrorCode(error) !== "P2002") throw error;
        }
    }
}

/**
 * MSG91 marks direction "0" for inbound, but its inbound sample omits it
 * (and says eventName "delivered"), while every outbound report carries a
 * requestId. shortcut: read inbound off that sample; confirm on the live account.
 */
function isInbound(r: Msg91Report): boolean {
    if (r.direction === "0" || r.direction === 0) return true;
    return (
        (r.direction === undefined || r.direction === null) &&
        !text(r.requestId) &&
        /^\+?\d{8,15}$/.test(text(r.customerNumber)) &&
        !!text(r.contentType)
    );
}

/** MSG91's `ts`, never later than now (the window can't be opened ahead). */
function inboundAt(ts: unknown): Date {
    const now = new Date();
    const at = typeof ts === "string" ? new Date(ts) : now;
    return Number.isNaN(at.getTime()) || at > now ? now : at;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function secretMatches(given: string | undefined, expected?: string): boolean {
    if (!given || !expected) return false;
    // Hashed first so the compare is constant time whatever the lengths.
    const digest = (s: string) => createHash("sha256").update(s).digest();
    return timingSafeEqual(digest(given), digest(expected));
}

/** Only MSG91's leading error code is kept; its words can carry the number. */
function failureCode(reason: unknown): string {
    const code =
        typeof reason === "string" ? /^\s*(\d{1,8})\b/.exec(reason)?.[1] : null;
    return code ? `whatsapp_${code}` : "undelivered";
}
