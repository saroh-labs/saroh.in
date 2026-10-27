import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, MessagingSendStatus } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { EncryptedSecret } from "../../common/crypto";
import { env } from "../../env";
import { nextBackoff } from "../jobs/job-queue.port";
import {
    countUsage,
    inReplyWindow,
    numberHash,
    openRequest,
    sealRequest,
} from "./messaging-records";
import type {
    MessagingProvider,
    SendResult,
    SmsSendResult,
    WhatsAppTemplateCategory,
} from "./providers/messaging-provider.port";
import { MESSAGING_PROVIDER } from "./providers/messaging-provider.port";

/** Retries a send whose provider answered with a temporary failure. */
export const MESSAGING_SEND_TYPE = "messaging.send";

/** Tries in all, the first (inline) one included. */
const MAX_ATTEMPTS = 6;

/** A provider answer worth asking again: never a 4xx refusal. */
const TEMPORARY = new Set(["provider_unavailable", "rate_limited"]);

type QueuedRequest =
    | {
          kind: "template";
          toE164: string;
          template: string;
          category: WhatsAppTemplateCategory;
          variables: string[];
      }
    | { kind: "text"; toE164: string; text: string };

export type MessageOutcome =
    /** The provider took it; its delivery report moves the status on. */
    | { outcome: "accepted"; messageId: string }
    /** A temporary failure: a job retries it with backoff. */
    | { outcome: "queued"; messageId: string }
    /** Refused for good (a 4xx, not on WhatsApp, an unknown template). */
    | { outcome: "failed"; messageId: string; reason: string }
    /** Not sent: a free-form reply outside the number's 24-hour window. */
    | { outcome: "refused"; reason: "outside_reply_window" };

export type OtpVerifyOutcome =
    | { ok: true; phoneE164: string }
    | {
          ok: false;
          reason: "invalid_token" | "not_a_phone" | "unavailable" | "mismatch";
      };

type Attempt =
    | { kind: "accepted" }
    | { kind: "temporary" }
    | { kind: "failed"; reason: string }
    | { kind: "done" };

/**
 * The public face of Saroh's own sender (MSG91 brief, 27 Oct). Other
 * modules call this, never the provider: it counts usage, keeps the
 * 24-hour reply window, records each message's status without its words
 * or number, and retries temporary failures through the job queue.
 *
 * OTP over SMS: MSG91's OTP widget sends and checks the code in the
 * customer's browser (no DLT of our own yet), so the server side is
 * verify-only: {@link verifyOtp} checks the widget's access token.
 * {@link sendOtp} is the server-made code over WhatsApp's authentication
 * template (`VerificationSendService` keeps the code and the wallet).
 */
@Injectable()
export class MessagingService {
    private readonly logger = new Logger(MessagingService.name);

    constructor(
        @Inject(MESSAGING_PROVIDER)
        private readonly provider: MessagingProvider,
    ) {}

    /** A server-made code on WhatsApp. Throws on a network error, as the provider does. */
    async sendOtp(input: {
        toE164: string;
        code: string;
    }): Promise<SendResult> {
        const result = await this.provider.sendWhatsappAuth(input);
        if (result.outcome === "accepted") await countUsage("WHATSAPP");
        return result;
    }

    /**
     * Check the OTP widget's access token. With `expectedE164`, a token
     * verified for any other number is a `mismatch`.
     */
    async verifyOtp(input: {
        accessToken: string;
        expectedE164?: string;
    }): Promise<OtpVerifyOutcome> {
        const result = await this.provider.verifyOtpWidgetToken(
            input.accessToken,
        );
        if (!result.ok) return result;
        // MSG91 bills the OTP whoever asked for it.
        await countUsage("OTP");
        if (
            input.expectedE164 &&
            digits(input.expectedE164) !== digits(result.phoneE164)
        ) {
            return { ok: false, reason: "mismatch" };
        }
        return result;
    }

    /** What the browser loads the OTP widget with; null until configured. */
    otpWidgetConfig(): { widgetId: string; tokenAuth: string } | null {
        const { MSG91_WIDGET_ID: widgetId, MSG91_WIDGET_TOKEN: tokenAuth } =
            env;
        return widgetId && tokenAuth ? { widgetId, tokenAuth } : null;
    }

    sendWhatsAppTemplate(input: {
        toE164: string;
        template: string;
        category: WhatsAppTemplateCategory;
        variables: string[];
    }): Promise<MessageOutcome> {
        return this.queueAndSend({ kind: "template", ...input });
    }

    /** Refused unless the number wrote to us within the last 24 hours (inbound webhook). */
    async sendWhatsAppText(input: {
        toE164: string;
        text: string;
    }): Promise<MessageOutcome> {
        if (!(await inReplyWindow(numberHash(input.toE164)))) {
            return { outcome: "refused", reason: "outside_reply_window" };
        }
        return this.queueAndSend({ kind: "text", ...input });
    }

    async sendSms(input: {
        toE164: string;
        text: string;
    }): Promise<SmsSendResult> {
        const result = await this.provider.sendSms(input);
        if (result.outcome === "accepted") await countUsage("SMS");
        return result;
    }

    /** The `messaging.send` job: one more try of a queued message. */
    handleSendJob = async (job: Job): Promise<void> => {
        const { messageId } = job.payload as { messageId?: string };
        if (!messageId) return;
        const attempt = await this.attempt(messageId);
        if (attempt.kind !== "temporary") return;
        if (job.attempts + 1 >= job.maxAttempts) {
            await this.fail(messageId, "provider_unavailable");
            return;
        }
        // The worker retries it with backoff.
        throw new Error(
            `messaging.send temporary failure message=${messageId}`,
        );
    };

    private async queueAndSend(
        request: QueuedRequest,
    ): Promise<MessageOutcome> {
        const message = await prisma.messagingMessage.create({
            data: {
                channel: "WHATSAPP",
                templateName:
                    request.kind === "template" ? request.template : null,
                templateCategory:
                    request.kind === "template" ? request.category : null,
                numberHash: numberHash(request.toE164),
                sealedRequest: { ...sealRequest(request) },
            },
            select: { id: true },
        });
        const messageId = message.id;
        const attempt = await this.attempt(messageId, request);
        switch (attempt.kind) {
            case "accepted":
            case "done":
                return { outcome: "accepted", messageId };
            case "failed":
                return { outcome: "failed", messageId, reason: attempt.reason };
            case "temporary":
                await prisma.job.create({
                    data: {
                        type: MESSAGING_SEND_TYPE,
                        payload: { messageId },
                        maxAttempts: MAX_ATTEMPTS - 1,
                        runAt: new Date(Date.now() + nextBackoff(1)),
                    },
                });
                return { outcome: "queued", messageId };
        }
    }

    /**
     * One try. Only a QUEUED row is sent, and acceptance is written fenced
     * on QUEUED, so a job that runs again after MSG91 accepted sends nothing.
     * shortcut: a crash between MSG91 accepting and the write below sends once more on retry (MSG91 takes no idempotency key); add one if MSG91 offers it.
     */
    private async attempt(
        messageId: string,
        known?: QueuedRequest,
    ): Promise<Attempt> {
        let request = known;
        if (!request) {
            const row = await prisma.messagingMessage.findUnique({
                where: { id: messageId },
                select: { status: true, sealedRequest: true },
            });
            if (row?.status !== "QUEUED" || !row.sealedRequest)
                return { kind: "done" };
            request = openRequest<QueuedRequest>(
                row.sealedRequest as unknown as EncryptedSecret,
            );
        }

        let result: SendResult;
        try {
            result =
                request.kind === "template"
                    ? await this.provider.sendWhatsAppTemplate(request)
                    : await this.provider.sendWhatsAppText(request);
        } catch {
            this.logger.warn(
                `messaging_send temporary message=${messageId} code=network_error`,
            );
            return { kind: "temporary" };
        }

        if (result.outcome === "accepted") {
            const won = await prisma.messagingMessage.updateMany({
                where: { id: messageId, status: "QUEUED" },
                data: {
                    status: "SENT",
                    providerMessageId: result.providerMessageId,
                    sentAt: new Date(),
                    sealedRequest: Prisma.DbNull,
                },
            });
            if (won.count === 1) await countUsage("WHATSAPP");
            return { kind: "accepted" };
        }
        const reason =
            result.outcome === "ineligible" ? "not_on_whatsapp" : result.reason;
        if (TEMPORARY.has(reason)) {
            this.logger.warn(
                `messaging_send temporary message=${messageId} code=${reason}`,
            );
            return { kind: "temporary" };
        }
        await this.fail(messageId, reason);
        return { kind: "failed", reason };
    }

    private async fail(messageId: string, reason: string): Promise<void> {
        this.logger.warn(
            `messaging_send failed message=${messageId} code=${reason}`,
        );
        await prisma.messagingMessage.updateMany({
            where: {
                id: messageId,
                status: "QUEUED" satisfies MessagingSendStatus,
            },
            data: {
                status: "FAILED",
                failureReason: reason,
                failedAt: new Date(),
                sealedRequest: Prisma.DbNull,
            },
        });
    }
}

function digits(e164: string): string {
    return e164.replace(/\D/g, "");
}
