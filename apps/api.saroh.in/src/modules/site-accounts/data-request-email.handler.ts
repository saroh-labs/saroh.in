import { Inject, Injectable, Optional } from "@nestjs/common";
import type { CustomerDataRequestStatus, Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { EmailOutcome } from "../../common/email";
import { sendSiteAccountNoticeEmail } from "../../common/email";
import { structuredLogger } from "../../common/logging/structured-logger";
import { MessagingService } from "../messaging/messaging.service";
import type { DataRequestEmailStep } from "./data-request-emails";
import { dataRequestEmail } from "./data-request-emails";
import { cleanBusinessName } from "./sender-name";

/**
 * `customer.data-request.email`: Saroh's email to a customer about their
 * "Ask to remove my data" request (DEC-172, #1106), from the sign-in code
 * sender in the business's name (`data-request-emails.ts`).
 *
 * Queued on the transaction that made the step true, so a rolled-back step
 * sends nothing: the request's create ("received"), the privacy removal's
 * last transaction ("done", `privacy-removal-writes.ts`), and the close
 * without removal ("closed"). The payload carries ids only; the run reads
 * the request again, which keeps the requester's email after the removal
 * deleted their account.
 *
 * Once per step: recorded as a `CustomerNotice` (`data-request:<id>:<step>`)
 * once it has left, and a run that finds it says nothing. A send that fails
 * throws, so the worker tries again. At least once: the worker never runs
 * one job twice at a time, and a legal notice is worth a rare second copy
 * should the record's write fail after the send.
 *
 * A phone-only requester (DEC-196, Follow-ups) has no email. Built, but
 * off ({@link SAROH_SENDS_DATA_REQUEST_WHATSAPP}, owner 27 Oct): "received"
 * and "done" would go as a WhatsApp utility template from Saroh's own
 * number ({@link DATA_REQUEST_TEMPLATES}), paid by Saroh, never held
 * against the business's balance. MessagingService retries a temporary
 * failure itself. A template that isn't configured, or a send refused for
 * good, is logged (no number) and recorded as not sent
 * (`…:<step>:not-sent`), so the business's list says so; the removal never
 * waits on it. "Closed" has no template: recorded as not sent.
 */
export const DATA_REQUEST_EMAIL_TYPE = "customer.data-request.email";

/** Who sends it; a test passes its own. */
export const DATA_REQUEST_EMAIL_SENDER = Symbol("DATA_REQUEST_EMAIL_SENDER");
export type DataRequestEmailSender = typeof sendSiteAccountNoticeEmail;

export interface DataRequestEmailPayload {
    requestId: string;
    step: DataRequestEmailStep;
}

type Tx = Pick<Prisma.TransactionClient, "job">;

/** Queue one step's email on the caller's transaction. */
export async function enqueueDataRequestEmail(
    tx: Tx,
    organizationId: string,
    payload: DataRequestEmailPayload,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId,
            type: DATA_REQUEST_EMAIL_TYPE,
            payload: { ...payload },
        },
    });
}

/** The status a step's email still stands for. */
const STANDS: Record<DataRequestEmailStep, CustomerDataRequestStatus | null> = {
    // Received is true whatever happened since.
    received: null,
    done: "DONE",
    closed: "CLOSED_WITHOUT_REMOVAL",
};

const KIND: Record<DataRequestEmailStep, string> = {
    received: "DATA_REQUEST_RECEIVED",
    done: "DATA_REQUEST_DONE",
    closed: "DATA_REQUEST_CLOSED",
};

/** Saroh's WhatsApp utility template keys (the messaging doc). */
export const DATA_REQUEST_TEMPLATES: Partial<
    Record<DataRequestEmailStep, string>
> = {
    received: "data_request_received",
    done: "data_request_done",
};

/**
 * Whether Saroh sends these notices on WhatsApp at all. Off by the owner's
 * decision of 27 Oct: Saroh sends no WhatsApp on a business's behalf (Meta
 * allows one business per WhatsApp account); businesses connect their own
 * WhatsApp later.
 * shortcut: the send is built but off, so a phone-only requester is never told; turn on (or route through the business's own WhatsApp) once that decision changes.
 */
export const SAROH_SENDS_DATA_REQUEST_WHATSAPP = false as boolean;

/** What a step that couldn't reach a phone-only requester is recorded as. */
export const DATA_REQUEST_NOT_SENT = "DATA_REQUEST_NOT_SENT";

/** The claim's key: one email per request and step. */
export function dataRequestEventKey(
    requestId: string,
    step: DataRequestEmailStep,
): string {
    return `data-request:${requestId}:${step}`;
}

/** The record that a step's notice was given up on. */
export function dataRequestNotSentKey(
    requestId: string,
    step: DataRequestEmailStep,
): string {
    return `${dataRequestEventKey(requestId, step)}:not-sent`;
}

/** "27 Oct 2026", as the done notice dates the removal (India). */
const NOTICE_DATE = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
});

@Injectable()
export class DataRequestEmailHandler {
    constructor(
        @Optional()
        @Inject(DATA_REQUEST_EMAIL_SENDER)
        private readonly send: DataRequestEmailSender = sendSiteAccountNoticeEmail,
        @Optional()
        private readonly messaging?: MessagingService,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        const organizationId = job.organizationId;
        if (!payload || !organizationId) {
            structuredLogger.warn("data_request_email_skipped", {
                jobId: job.id,
            });
            return;
        }
        const eventKey = dataRequestEventKey(payload.requestId, payload.step);
        const due = await runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                const told = await tx.customerNotice.findFirst({
                    where: {
                        organizationId,
                        eventKey: {
                            in: [
                                eventKey,
                                dataRequestNotSentKey(
                                    payload.requestId,
                                    payload.step,
                                ),
                            ],
                        },
                    },
                    select: { id: true },
                });
                if (told) return null;
                const request = await tx.customerDataRequest.findFirst({
                    where: { id: payload.requestId, organizationId },
                    select: {
                        status: true,
                        requesterEmail: true,
                        requesterPhoneE164: true,
                        contactId: true,
                        handledAt: true,
                    },
                });
                // Nobody left to tell: the "done" notice already went.
                if (!request?.requesterEmail && !request?.requesterPhoneE164) {
                    return null;
                }
                const stands = STANDS[payload.step];
                if (stands && request.status !== stands) return null;
                const org = await tx.organization.findUnique({
                    where: { id: organizationId },
                    select: { name: true },
                });
                return {
                    to: request.requesterEmail,
                    phone: request.requesterPhoneE164,
                    handledAt: request.handledAt,
                    contactId: request.contactId,
                    business: cleanBusinessName(
                        org?.name ?? "",
                        "the business",
                    ),
                };
            }),
        );
        if (!due) return;
        if (!due.to) {
            // A phone-only requester (DEC-196): on WhatsApp instead.
            await this.notifyPhone(organizationId, payload, {
                ...due,
                phone: due.phone ?? "",
            });
            return;
        }
        const to: string = due.to;

        const words = dataRequestEmail(payload.step, due.business);
        let outcome: EmailOutcome;
        try {
            outcome = await this.send(to, {
                businessName: due.business,
                ...words,
            });
        } catch {
            outcome = "failed";
        }
        if (outcome === "sent") {
            // Once the "done" email has gone, the email it went to leaves
            // the request too (review #19): nothing more is sent to them.
            await record(organizationId, payload, {
                eventKey,
                kind: KIND[payload.step],
                contactId: due.contactId,
            });
            return;
        }

        // Not sent: nothing recorded, so the retry sends it. Ids only.
        structuredLogger.error("data_request_email_not_sent", {
            organizationId,
            requestId: payload.requestId,
            step: payload.step,
            outcome,
        });
        throw new Error(
            `data request email not sent (${outcome}); the job retries`,
        );
    };

    /**
     * A phone-only requester's notice, by WhatsApp from Saroh's number
     * (DEC-196, Follow-ups). Never throws for a send that can't go: it is
     * logged and recorded as not sent, and the business's list says so.
     */
    private async notifyPhone(
        organizationId: string,
        payload: DataRequestEmailPayload,
        due: {
            phone: string;
            business: string;
            handledAt: Date | null;
            contactId: string | null;
        },
    ): Promise<void> {
        const { requestId, step } = payload;
        const template = DATA_REQUEST_TEMPLATES[step];
        let reason = SAROH_SENDS_DATA_REQUEST_WHATSAPP
            ? "no_template"
            : "saroh_whatsapp_off";
        if (SAROH_SENDS_DATA_REQUEST_WHATSAPP && template && this.messaging) {
            // Saroh's own sender: no hold on the business's balance.
            const outcome = await this.messaging.sendWhatsAppTemplate({
                toE164: due.phone,
                template,
                category: "utility",
                variables:
                    step === "done"
                        ? [
                              due.business,
                              NOTICE_DATE.format(due.handledAt ?? new Date()),
                          ]
                        : [due.business],
            });
            if (
                outcome.outcome === "accepted" ||
                outcome.outcome === "queued"
            ) {
                // A queued send is retried by MessagingService; should it
                // fail for good, the list reads that from its message.
                await record(organizationId, payload, {
                    eventKey: dataRequestEventKey(requestId, step),
                    kind: KIND[step],
                    contactId: due.contactId,
                    messageId: outcome.messageId,
                });
                return;
            }
            reason = outcome.reason;
        }
        // Ids only, never the number.
        structuredLogger.warn("data_request_whatsapp_not_sent", {
            organizationId,
            requestId,
            step,
            reason,
        });
        await record(organizationId, payload, {
            eventKey: dataRequestNotSentKey(requestId, step),
            kind: DATA_REQUEST_NOT_SENT,
            contactId: due.contactId,
        });
    }
}

/**
 * Record a step's outcome (a duplicate is skipped, never thrown); after
 * "done", the requester's email and number leave the request.
 */
async function record(
    organizationId: string,
    payload: DataRequestEmailPayload,
    notice: {
        eventKey: string;
        kind: string;
        contactId: string | null;
        messageId?: string;
    },
): Promise<void> {
    await runInOrgContext(organizationId, () =>
        prisma.$transaction(async (tx) => {
            await tx.customerNotice.createMany({
                data: [{ organizationId, ...notice }],
                skipDuplicates: true,
            });
            if (payload.step === "done") {
                await tx.customerDataRequest.updateMany({
                    where: {
                        id: payload.requestId,
                        organizationId,
                        status: "DONE",
                    },
                    data: { requesterEmail: null, requesterPhoneE164: null },
                });
            }
        }),
    );
}

function payloadOf(value: unknown): DataRequestEmailPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Record<string, unknown>;
    if (typeof p.requestId !== "string" || p.requestId === "") return null;
    if (p.step !== "received" && p.step !== "done" && p.step !== "closed") {
        return null;
    }
    return { requestId: p.requestId, step: p.step };
}
