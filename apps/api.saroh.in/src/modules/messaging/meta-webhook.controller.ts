import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
    Controller,
    ForbiddenException,
    Get,
    Header,
    Headers,
    HttpCode,
    Optional,
    Post,
    Query,
    RawBodyRequest,
    Req,
    UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { env } from "../../env";
import { applyInbound, applyStatus } from "./delivery-reports";
import { WalletService } from "./wallet.service";
import { WhatsappSignInHealth } from "./whatsapp-signin-health";

/** Meta's signature header: `sha256=<hex HMAC-SHA256 of the raw body under the app secret>`. */
export const META_SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * Meta's template webhooks on Saroh's WhatsApp account (owner subscribed,
 * 19 Nov): only the sign-in template's are acted on
 * ({@link WhatsappSignInHealth.templateEvent}).
 */
const TEMPLATE_FIELDS = new Set([
    "message_template_status_update",
    "message_template_quality_update",
    "message_template_components_update",
]);

/** The parts of Meta's `messages` webhook we read; each is checked as read. */
interface MetaValue {
    metadata?: { phone_number_id?: unknown };
    statuses?: unknown;
    messages?: unknown;
}

/**
 * PUBLIC, platform-level Meta WhatsApp Cloud API webhook (DEC-213): the Meta
 * app subscribed to Saroh's WhatsApp account posts every send's status and
 * every inbound message here, so there is no business in the URL. What each
 * one changes is `delivery-reports.ts`, shared with MSG91's webhook.
 * Shapes: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
 *
 * - GET is Meta's verify handshake: the challenge goes back only for
 *   `hub.mode=subscribe` with our verify token, else 403.
 * - POST is trusted only when `X-Hub-Signature-256` is the HMAC of the exact
 *   raw bytes under the app secret, checked before the body is read; else
 *   401. A signed body we can't read or match is a 200 no-op, as Meta
 *   retries anything else for days.
 * - Template status, quality and components changes go to
 *   {@link WhatsappSignInHealth}; any other field is a 200 no-op.
 */
@Controller("public/webhooks/meta")
export class MetaWebhookController {
    constructor(
        private readonly wallet: WalletService,
        // Not a DI provider: a per-instance default tests can replace.
        @Optional()
        private readonly health: WhatsappSignInHealth = new WhatsappSignInHealth(),
    ) {}

    @Get()
    @Header("Content-Type", "text/plain")
    verify(
        @Query("hub.mode") mode: unknown,
        @Query("hub.verify_token") token: unknown,
        @Query("hub.challenge") challenge: unknown,
    ): string {
        if (
            mode !== "subscribe" ||
            typeof challenge !== "string" ||
            !sameSecret(token, env.META_WA_WEBHOOK_VERIFY_TOKEN)
        ) {
            throw new ForbiddenException("Webhook verification failed");
        }
        return challenge;
    }

    @Post()
    @HttpCode(200)
    async handle(
        @Headers(META_SIGNATURE_HEADER) signature: string | undefined,
        @Req() req: RawBodyRequest<Request>,
    ): Promise<{ ok: true }> {
        const raw = req.rawBody;
        if (!raw || !signatureMatches(raw, signature, env.META_APP_SECRET)) {
            throw new UnauthorizedException("Webhook verification failed");
        }
        // Read from the verified bytes, never a separately parsed body.
        let body: unknown;
        try {
            body = JSON.parse(raw.toString("utf8"));
        } catch {
            return { ok: true };
        }
        for (const value of values(body)) await this.apply(value);
        for (const change of changes(body)) {
            const field = text(change.field);
            if (TEMPLATE_FIELDS.has(field)) {
                await this.health.templateEvent(field, change.value);
            }
        }
        return { ok: true };
    }

    private async apply(value: MetaValue): Promise<void> {
        for (const s of list<{
            id?: unknown;
            status?: unknown;
            errors?: unknown;
        }>(value.statuses)) {
            const [code] = list<{ code?: unknown }>(s.errors).map(
                (e) => e.code,
            );
            // Only Meta's numeric code is kept; its words can carry the number.
            const failureReason =
                typeof code === "number" || /^\d{1,8}$/.test(text(code))
                    ? `whatsapp_${String(code)}`
                    : "undelivered";
            await applyStatus(this.wallet, {
                ids: [text(s.id)],
                status: text(s.status),
                failureReason,
            });
            // An account sign-in code Meta couldn't deliver (counted once).
            if (text(s.status).toLowerCase() === "failed") {
                await this.health.deliveryFailed(text(s.id), failureReason);
            }
        }
        for (const m of list<{
            id?: unknown;
            from?: unknown;
            timestamp?: unknown;
        }>(value.messages)) {
            const from = text(m.from);
            // Meta's `from` is the WhatsApp id: country code and digits.
            if (!/^\d{8,15}$/.test(from)) continue;
            await applyInbound(text(m.id), `+${from}`, inboundAt(m.timestamp));
        }
    }
}

/**
 * Every `entry[].changes[].value` of the `messages` field for Saroh's own
 * number: the account may hold other numbers, whose messages must not open
 * our reply window.
 */
function values(body: unknown): MetaValue[] {
    const ours = env.META_WA_PHONE_NUMBER_ID;
    return changes(body)
        .filter((c) => c.field === "messages")
        .flatMap((c) => list<MetaValue>([c.value]))
        .filter((v) => !ours || v.metadata?.phone_number_id === ours);
}

/** Every `entry[].changes[]`, whatever its field. */
function changes(body: unknown): { field?: unknown; value?: unknown }[] {
    const entry = (body as { entry?: unknown } | null)?.entry;
    return list<{ changes?: unknown }>(entry).flatMap((e) =>
        list<{ field?: unknown; value?: unknown }>(e.changes),
    );
}

/** The objects in `value` when it is an array; anything else is none. */
function list<T extends object>(value: unknown): T[] {
    return Array.isArray(value)
        ? value.filter((v): v is T => !!v && typeof v === "object")
        : [];
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

/** Meta's unix-seconds `timestamp`, never later than now (the window can't be opened ahead). */
function inboundAt(ts: unknown): Date {
    const now = new Date();
    const seconds = Number(text(ts));
    const at =
        Number.isFinite(seconds) && seconds > 0
            ? new Date(seconds * 1000)
            : now;
    return at > now ? now : at;
}

function signatureMatches(
    raw: Buffer,
    header: string | undefined,
    secret: string | undefined,
): boolean {
    if (raw.length === 0 || !header || !secret) return false;
    const expected = Buffer.from(
        `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
    );
    const given = Buffer.from(header.trim().toLowerCase());
    return given.length === expected.length && timingSafeEqual(given, expected);
}

function sameSecret(given: unknown, expected?: string): boolean {
    if (typeof given !== "string" || !given || !expected) return false;
    // Hashed first so the compare is constant time whatever the lengths.
    const digest = (s: string) => createHash("sha256").update(s).digest();
    return timingSafeEqual(digest(given), digest(expected));
}
