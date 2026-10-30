import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type {
    MessagingProvider,
    SendResult,
    SmsSendResult,
    WhatsappAuthInput,
    WhatsAppTemplateCategory,
    WidgetVerifyResult,
} from "./messaging-provider.port";

/**
 * Network-free {@link MessagingProvider} for tests and local development
 * without credentials. Records every send; a number can be marked
 * ineligible or rejected, the next sends can be made to fail, and widget
 * tokens map to numbers.
 */
@Injectable()
export class FakeMessagingProvider implements MessagingProvider {
    /** Authentication-template codes, with all four of the template's values. */
    readonly sends: WhatsappAuthInput[] = [];
    /** Every other WhatsApp send, in order. */
    readonly messages: (
        | {
              kind: "template";
              toE164: string;
              template: string;
              category: WhatsAppTemplateCategory;
              variables: string[];
          }
        | { kind: "text"; toE164: string; text: string }
    )[] = [];
    private readonly ineligible = new Set<string>();
    private readonly rejected = new Map<string, string>();
    /** Each queued failure is used by one send, then gone. */
    private readonly failures: string[] = [];
    private readonly widgetTokens = new Map<string, string>();
    private seq = 0;
    // Ids stay unique across fakes: a message id is unique in the database.
    private readonly instance = randomUUID().slice(0, 8);

    markIneligible(toE164: string): void {
        this.ineligible.add(toE164);
    }

    reject(toE164: string, reason = "refused"): void {
        this.rejected.set(toE164, reason);
    }

    /** The next send throws (`"throw"`, a timeout) or is rejected with this reason. */
    failNext(failure: string): void {
        this.failures.push(failure);
    }

    /** A token the fake widget handed out for this number. */
    issueWidgetToken(token: string, phoneE164: string): void {
        this.widgetTokens.set(token, phoneE164);
    }

    sendWhatsappAuth(input: WhatsappAuthInput): Promise<SendResult> {
        this.sends.push(input);
        return this.result(input.toE164);
    }

    sendWhatsAppTemplate(input: {
        toE164: string;
        template: string;
        category: WhatsAppTemplateCategory;
        variables: string[];
    }): Promise<SendResult> {
        this.messages.push({ kind: "template", ...input });
        return this.result(input.toE164);
    }

    sendWhatsAppText(input: {
        toE164: string;
        text: string;
    }): Promise<SendResult> {
        this.messages.push({ kind: "text", ...input });
        return this.result(input.toE164);
    }

    sendSms(): Promise<SmsSendResult> {
        return Promise.resolve({ outcome: "unavailable" });
    }

    verifyOtpWidgetToken(accessToken: string): Promise<WidgetVerifyResult> {
        const phoneE164 = this.widgetTokens.get(accessToken);
        return Promise.resolve(
            phoneE164
                ? { ok: true, phoneE164 }
                : { ok: false, reason: "invalid_token" },
        );
    }

    private result(toE164: string): Promise<SendResult> {
        const failure = this.failures.shift();
        if (failure === "throw")
            return Promise.reject(new Error("fake send: network error"));
        if (failure)
            return Promise.resolve({ outcome: "rejected", reason: failure });
        if (this.ineligible.has(toE164))
            return Promise.resolve({ outcome: "ineligible" });
        const reason = this.rejected.get(toE164);
        if (reason) return Promise.resolve({ outcome: "rejected", reason });
        return Promise.resolve({
            outcome: "accepted",
            providerMessageId: `fake_whatsapp_${this.instance}_${++this.seq}`,
        });
    }
}
