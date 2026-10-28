import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, MessagingSendStatus } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { EncryptedSecret } from "../../common/crypto";
import { prismaErrorCode } from "../../common/prisma-errors";
import { env } from "../../env";
import { nextBackoff } from "../jobs/job-queue.port";
import {
    countUsage,
    inReplyWindow,
    numberHash,
    openRequest,
    sealRequest,
} from "./messaging-records";
import { FakeMessagingProvider } from "./providers/fake-messaging-provider";
import type {
    MessagingProvider,
    SendResult,
    SmsSendResult,
    WhatsappAuthInput,
    WhatsAppTemplateCategory,
} from "./providers/messaging-provider.port";
import { MESSAGING_PROVIDER } from "./providers/messaging-provider.port";

/** Retries a send whose provider answered with a temporary failure. */
export const MESSAGING_SEND_TYPE = "messaging.send";

/** The OTP widget's script, as the provider documents it. */
const OTP_WIDGET_SCRIPT = "https://verify.msg91.com/otp-provider.js";

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
          reason:
              | "invalid_token"
              | "not_a_phone"
              | "unavailable"
              | "mismatch"
              | "used";
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
 * template: Saroh accounts' sign-in codes (`AccountPhoneService`, owner
 * 28 Oct: "widget is for SMS") and the hidden business path
 * (`VerificationSendService`, DEC-197).
 */
@Injectable()
export class MessagingService {
    private readonly logger = new Logger(MessagingService.name);

    constructor(
        @Inject(MESSAGING_PROVIDER)
        private readonly provider: MessagingProvider,
    ) {}

    /** A server-made code on WhatsApp. Throws on a network error, as the provider does. */
    async sendOtp(input: WhatsappAuthInput): Promise<SendResult> {
        const result = await this.provider.sendWhatsappAuth(input);
        if (result.outcome === "accepted") await countUsage("WHATSAPP");
        return result;
    }

    /**
     * Check the OTP widget's access token: a token verified for any number
     * but `expectedE164` is a `mismatch`, and one already taken here is
     * `used` (DEC-198), whatever the provider says of it now.
     */
    async verifyOtp(input: {
        accessToken: string;
        expectedE164: string;
    }): Promise<OtpVerifyOutcome> {
        const result = await this.provider.verifyOtpWidgetToken(
            input.accessToken,
        );
        if (!result.ok) return result;
        // MSG91 bills the OTP whoever asked for it.
        await countUsage("OTP");
        if (digits(input.expectedE164) !== digits(result.phoneE164)) {
            return { ok: false, reason: "mismatch" };
        }
        if (!(await claimWidgetToken(input.accessToken))) {
            return { ok: false, reason: "used" };
        }
        return result;
    }

    /**
     * What the browser loads the OTP widget with; null until configured.
     * `scriptUrl` is the provider's documented script, named here so no
     * other app has to name the provider.
     */
    otpWidgetConfig(): {
        widgetId: string;
        tokenAuth: string;
        scriptUrl: string;
    } | null {
        const { MSG91_WIDGET_ID: widgetId, MSG91_WIDGET_TOKEN: tokenAuth } =
            env;
        return widgetId && tokenAuth
            ? { widgetId, tokenAuth, scriptUrl: OTP_WIDGET_SCRIPT }
            : null;
    }

    /**
     * Whether {@link sendOtp} can send: the fake, or Saroh's MSG91 sender
     * with its key, number and authentication template all set.
     */
    get whatsappOtpReady(): boolean {
        return (
            this.otpStandIn ||
            Boolean(
                env.MSG91_AUTH_KEY &&
                env.MSG91_WHATSAPP_NUMBER &&
                env.MSG91_WHATSAPP_TEMPLATE,
            )
        );
    }

    /** Whether OTP tokens come from the fake's stand-in, not a widget. */
    get otpStandIn(): boolean {
        return this.provider instanceof FakeMessagingProvider;
    }

    /**
     * Development and test only: with the fake provider there is no widget,
     * so the fake hands out a token for this number, which the browser's
     * stand-in step sends back and {@link verifyOtp} then checks like a real
     * one. Null with a real provider (the factory never uses the fake
     * outside development and test).
     */
    standInOtpToken(phoneE164: string): string | null {
        if (!this.otpStandIn) return null;
        const token = `stand-in-${randomUUID()}`;
        (this.provider as FakeMessagingProvider).issueWidgetToken(
            token,
            phoneE164,
        );
        return token;
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

/** How long a used widget token is remembered: well past its own life. */
const TOKEN_MEMORY_MS = 24 * 60 * 60 * 1000;

/**
 * Take a widget token once (DEC-198): its sha256 into a unique key. False
 * when it was taken before. Expired rows are pruned on the way.
 */
async function claimWidgetToken(accessToken: string): Promise<boolean> {
    const now = new Date();
    await prisma.otpWidgetTokenUse.deleteMany({
        where: { expiresAt: { lt: now } },
    });
    try {
        await prisma.otpWidgetTokenUse.create({
            data: {
                tokenHash: createHash("sha256")
                    .update(accessToken)
                    .digest("hex"),
                expiresAt: new Date(now.getTime() + TOKEN_MEMORY_MS),
            },
            select: { tokenHash: true },
        });
        return true;
    } catch (error) {
        if (prismaErrorCode(error) === "P2002") return false;
        throw error;
    }
}
