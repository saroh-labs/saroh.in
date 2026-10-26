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

import { env } from "../../env";
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

interface Msg91Report {
    requestId?: unknown;
    uuid?: unknown;
    eventName?: unknown;
    reason?: unknown;
}

/**
 * PUBLIC, platform-level MSG91 WhatsApp delivery reports (DEC-191, #1243):
 * Saroh's own MSG91 account posts every send's status here, so there is no
 * business in the URL; the send is found by its MSG91 id across businesses.
 * DELIVERED (or READ first) charges the held price once; FAILED gives it back.
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
        const { requestId, uuid, eventName, reason } = report as Msg91Report;
        const status =
            typeof eventName === "string" ? eventName.toUpperCase() : "";
        const from = FROM[status];
        // Our send stored MSG91's request id (or its message uuid); either matches.
        const ids = [requestId, uuid].filter(
            (id): id is string => typeof id === "string" && id.length > 0,
        );
        if (!from || ids.length === 0) return;

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
