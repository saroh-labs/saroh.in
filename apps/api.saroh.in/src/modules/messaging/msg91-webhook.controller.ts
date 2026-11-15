import { createHash, timingSafeEqual } from "node:crypto";

import {
    Body,
    Controller,
    Headers,
    HttpCode,
    Post,
    UnauthorizedException,
} from "@nestjs/common";

import { phoneE164 } from "@saroh/block-contract";

import { env } from "../../env";
import { applyInbound, applyStatus } from "./delivery-reports";
import { WalletService } from "./wallet.service";

/** The header the owner adds in MSG91's webhook settings, carrying `MSG91_WEBHOOK_SECRET`. */
export const MSG91_SECRET_HEADER = "x-saroh-webhook-secret";

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
 * every inbound message here, so there is no business in the URL. What
 * each report changes is `delivery-reports.ts`, shared with Meta's webhook.
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
            if (!number) return;
            // As our sends hash it: "9845012345" and "919845012345" are one number.
            await applyInbound(uuid, phoneE164(number), inboundAt(r.ts));
            return;
        }
        // Our send stored MSG91's request id (or its message uuid); either matches.
        await applyStatus(this.wallet, {
            ids: [text(r.requestId), uuid],
            status: typeof r.eventName === "string" ? r.eventName : "",
            failureReason: failureCode(r.reason),
        });
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
