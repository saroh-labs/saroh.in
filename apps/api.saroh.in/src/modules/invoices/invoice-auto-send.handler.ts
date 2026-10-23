import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { noticeOn } from "../communications/notice-settings";
import type { InvoiceAutoSendPayload } from "./invoice-auto-send";
import { autoSendPayloadOf, INVOICE_AUTO_SEND_TYPE } from "./invoice-auto-send";
import { JOB_ACTOR, recordInvoiceEvent } from "./invoice-events";
import { InvoiceSendService, SEND_SELECT } from "./invoice-send.service";

/** What one run came to, for its log and the specs. */
export type AutoSendOutcome =
    /** Sent, by email or into the account thread: AUTO_SENT. */
    | "SENT"
    /**
     * It couldn't go (no provider, no address, no way to pay when it can't
     * be paid online, …): SEND_FAILED, with why.
     */
    | "REFUSED"
    /** The business turned renewal invoices off meanwhile. */
    | "OFF"
    /** Paid (at the desk, say), voided or credited before it ran. */
    | "NOT_OWED"
    /** An autopay charge is under way on it: the receipt will tell them. */
    | "AUTOPAY"
    /** Someone pressed Send first, or a run before this one sent it. */
    | "ALREADY_SENT"
    /** Gone, or not a renewal's invoice. */
    | "SKIPPED";

/**
 * Why a send Saroh made couldn't go, as SEND_FAILED's `data.reason`: the
 * send flag's reason, the business details' (DEC-068), or REFUSED for any
 * other refusal. Codes, never the words or a token.
 */
export function refusalReason(err: HttpException): string {
    const body = err.getResponse();
    const reason =
        typeof body === "object"
            ? (body as { details?: { reason?: unknown } }).details?.reason
            : undefined;
    return typeof reason === "string" ? reason : "REFUSED";
}

/**
 * `invoice.auto-send` (automatic notices U10, DEC-174 R3): a membership's
 * renewal invoice, sent by Saroh on the business's behalf through the one
 * send path (`InvoiceSendService.sendAutomatic`), so every rule of a send
 * by hand holds: the business's own email provider (never Saroh's
 * address), the bill-to address, consent, the business details, DEC-110's
 * fresh pay link sealed into the email, its PDF, and the account thread
 * when `accountThreadOn`.
 *
 * It reads the invoice again first and sends nothing, quietly, when it
 * was paid at the desk, voided or credited since, an autopay charge is
 * under way on it, it was already sent, or the business turned "Renewal
 * invoices" off. A send that can't go (no provider and no thread, no
 * address, the business details missing, or no "How to pay us" set when
 * it can't be paid online: NO_WAY_TO_PAY, DEC-178) is written on the invoice's
 * history as SEND_FAILED with why, never thrown: a retry wouldn't change
 * it, and the merchant still has Send. Anything else (the database) is
 * thrown, and the worker retries; `alreadySent` keeps a retry to one send.
 */
@Injectable()
export class InvoiceAutoSendHandler {
    private readonly logger = new Logger(InvoiceAutoSendHandler.name);

    constructor(private readonly sends: InvoiceSendService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = autoSendPayloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${INVOICE_AUTO_SEND_TYPE} job ${job.id} names no invoice; nothing to send`,
            );
            return;
        }
        const outcome = await this.run(job.organizationId, payload);
        if (outcome === "REFUSED") {
            this.logger.log(
                `Renewal invoice ${payload.invoiceId} couldn't be sent automatically; noted on its history`,
            );
        }
    };

    /** One send, in the business's own RLS context. */
    run(
        organizationId: string,
        payload: InvoiceAutoSendPayload,
        now: Date = new Date(),
    ): Promise<AutoSendOutcome> {
        return runInOrgContext(organizationId, () =>
            this.send(organizationId, payload.invoiceId, now),
        );
    }

    private async send(
        organizationId: string,
        invoiceId: string,
        now: Date,
    ): Promise<AutoSendOutcome> {
        const row = await prisma.invoice.findFirst({
            where: { id: invoiceId, organizationId },
            select: SEND_SELECT,
        });
        if (row?.source !== "SUBSCRIPTION" || !row.subscriptionId) {
            return "SKIPPED";
        }
        if (!(await noticeOn(prisma, organizationId, "RENEWAL_INVOICE"))) {
            return "OFF";
        }
        const view = await this.sends.sendChannels(
            prisma,
            organizationId,
            row,
            now,
        );
        if (view.reason === "NOT_OWED") return "NOT_OWED";
        if (view.reason === "AUTOPAY_PENDING") return "AUTOPAY";
        if (await this.sends.alreadySent(prisma, invoiceId)) {
            return "ALREADY_SENT";
        }
        if (view.channels.length === 0) {
            return this.refused(organizationId, invoiceId, view.reason);
        }
        try {
            await this.sends.sendAutomatic(organizationId, invoiceId);
            return "SENT";
        } catch (err) {
            if (!(err instanceof HttpException)) throw err;
            // A charge or a Send that came in between the checks and the
            // send's own lock: nothing went wrong.
            const reason = refusalReason(err);
            if (reason === "autopay-pending") return "AUTOPAY";
            if (await this.sends.alreadySent(prisma, invoiceId)) {
                return "ALREADY_SENT";
            }
            return this.refused(organizationId, invoiceId, reason);
        }
    }

    private async refused(
        organizationId: string,
        invoiceId: string,
        reason: string | undefined,
    ): Promise<AutoSendOutcome> {
        await prisma.$transaction((tx) =>
            recordInvoiceEvent(tx, {
                organizationId,
                invoiceId,
                kind: "SEND_FAILED",
                actor: JOB_ACTOR,
                data: {
                    reason: reason ?? "REFUSED",
                    template: "INVOICE_SENT",
                },
            }),
        );
        return "REFUSED";
    }
}
