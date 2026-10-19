import { Inject, Injectable, Optional } from "@nestjs/common";
import type { CustomerDataRequestStatus, Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { EmailOutcome } from "../../common/email";
import { sendSiteAccountNoticeEmail } from "../../common/email";
import { structuredLogger } from "../../common/logging/structured-logger";
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

/** The claim's key: one email per request and step. */
export function dataRequestEventKey(
    requestId: string,
    step: DataRequestEmailStep,
): string {
    return `data-request:${requestId}:${step}`;
}

@Injectable()
export class DataRequestEmailHandler {
    constructor(
        @Optional()
        @Inject(DATA_REQUEST_EMAIL_SENDER)
        private readonly send: DataRequestEmailSender = sendSiteAccountNoticeEmail,
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
                    where: { organizationId, eventKey },
                    select: { id: true },
                });
                if (told) return null;
                const request = await tx.customerDataRequest.findFirst({
                    where: { id: payload.requestId, organizationId },
                    select: {
                        status: true,
                        requesterEmail: true,
                        contactId: true,
                    },
                });
                if (!request) return null;
                const stands = STANDS[payload.step];
                if (stands && request.status !== stands) return null;
                const org = await tx.organization.findUnique({
                    where: { id: organizationId },
                    select: { name: true },
                });
                return {
                    to: request.requesterEmail,
                    contactId: request.contactId,
                    business: cleanBusinessName(
                        org?.name ?? "",
                        "the business",
                    ),
                };
            }),
        );
        if (!due) return;

        const words = dataRequestEmail(payload.step, due.business);
        let outcome: EmailOutcome;
        try {
            outcome = await this.send(due.to, {
                businessName: due.business,
                ...words,
            });
        } catch {
            outcome = "failed";
        }
        if (outcome === "sent") {
            // The record that it went; a duplicate is skipped, never thrown.
            await runInOrgContext(organizationId, () =>
                prisma.customerNotice.createMany({
                    data: [
                        {
                            organizationId,
                            eventKey,
                            kind: KIND[payload.step],
                            contactId: due.contactId,
                        },
                    ],
                    skipDuplicates: true,
                }),
            );
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
