import type { Prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../../common/words-format";
import { noticeOn } from "../../communications/notice-settings";
import { JOB_ACTOR, recordInvoiceEvent } from "../../invoices/invoice-events";
import { leftToPayCents } from "../../invoices/invoice-state";
import { payLinkUrlFor } from "../../invoices/pay-link-url";
import { invoicePayOnline } from "../../invoices/pay-online";
import { replacePayTokenInTx } from "../../invoices/pay-token";
import { chargeUnderWayOn } from "../../payments/charge-under-way";
import {
    JOB,
    recordSubscriptionEvent,
} from "../../subscriptions/subscription-events";
import { enqueueCustomerNotice } from "../customer-notify-queue";
import { defineNotice, firstWord } from "./notice";

/**
 * A renewal's autopay charge failed (automatic notices U10, DEC-174 R3):
 * the customer is told, with a fresh link to pay — "We couldn't take
 * ₹1,200 for Monthly yoga. Pay here: ‹link›". Before this only the team
 * heard (F14), and the customer found out when the business chased them.
 *
 * - **Its switch** is "Failed autopay charges" (`AUTOPAY_FAILED`), asked
 *   when it is queued and again when it runs.
 * - **Read again when it runs.** An invoice paid, voided or credited
 *   since, or with a Retry by autopay under way, tells nobody.
 * - **The link is minted as the email goes** (DEC-110): the old link
 *   stops, the new one is sealed into the send job and never stored
 *   (`secretLink`). A business that doesn't take payment online sends a
 *   link to see the invoice and how to pay it instead. The new link is on
 *   the invoice's history (LINK_MADE, by Saroh) and the email on the
 *   subscription's (PAY_LINK_EMAILED), so the team knows the link they
 *   shared before no longer works.
 * - **Only when something was declined.** A charge that stood aside for a
 *   checkout the customer had open (CHECKOUT_OPEN) isn't a failure, and a
 *   capture at the wrong amount (AMOUNT_MISMATCH) took their money: the
 *   team sorts that one out, and "we couldn't take" would be untrue.
 */

export interface AutopayFailedVars {
    business: string;
    firstName: string | null;
    plan: string;
    /** "₹1,200.00": what is left to pay. */
    amount: string;
    /** The link takes payment (DEC-070); false: it shows how to pay. */
    payOnline: boolean;
}

export interface AutopayFailedNotice {
    kind: "AUTOPAY_FAILED";
    autopay: AutopayFailedVars;
}

/** Once per charge: a Retry that fails again is its own notice. */
export function autopayFailedNoticeKey(paymentIntentId: string): string {
    return `autopay-failed:${paymentIntentId}`;
}

/** The failures the customer is told about: the others aren't declines. */
const TOLD = new Set([
    "DECLINED",
    "NOTICE_FAILED",
    "NOTICE_NOT_DELIVERED",
    "PROVIDER_REFUSED",
]);

/**
 * Queue the notice for a failed charge on the caller's transaction (the
 * one that writes RENEWAL_FAILED), when the reason is a decline and the
 * business sends it. Returns whether it was queued.
 */
export async function enqueueAutopayFailedNotice(
    tx: Pick<Prisma.TransactionClient, "job" | "customerNoticeSetting">,
    organizationId: string,
    input: { invoiceId: string; paymentIntentId: string; reason: string },
): Promise<boolean> {
    if (!TOLD.has(input.reason)) return false;
    if (!(await noticeOn(tx, organizationId, "AUTOPAY_FAILED"))) return false;
    await enqueueCustomerNotice(tx, organizationId, {
        kind: "AUTOPAY_FAILED",
        eventKey: autopayFailedNoticeKey(input.paymentIntentId),
        invoiceId: input.invoiceId,
    });
    return true;
}

export const autopayFailedNotice = defineNotice<AutopayFailedNotice>({
    setting: "AUTOPAY_FAILED",
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "AUTOPAY_FAILED" || !payload.invoiceId) {
            return null;
        }
        const invoice = await tx.invoice.findFirst({
            where: { id: payload.invoiceId, organizationId },
            select: {
                id: true,
                status: true,
                kind: true,
                orderId: true,
                total: true,
                paidCents: true,
                currency: true,
                contactId: true,
                subscriptionId: true,
                subscription: { select: { plan: { select: { name: true } } } },
                contact: { select: { firstName: true } },
                organization: { select: { name: true } },
            },
        });
        if (
            invoice?.status !== "ISSUED" ||
            invoice.orderId ||
            invoice.kind === "CREDIT_NOTE" ||
            !invoice.contactId ||
            !invoice.subscription
        ) {
            return null;
        }
        const left = leftToPayCents(invoice);
        if (left <= 0) return null;
        // A Retry by autopay is on its way: it may still go through.
        if (await chargeUnderWayOn(tx, organizationId, invoice.id)) {
            return null;
        }
        return {
            contactId: invoice.contactId,
            invoiceId: invoice.id,
            vars: {
                kind: "AUTOPAY_FAILED",
                autopay: {
                    business: invoice.organization.name,
                    firstName: firstWord(invoice.contact?.firstName),
                    plan: invoice.subscription.plan.name,
                    amount: moneyWordsMinor(left, invoice.currency),
                    payOnline: await invoicePayOnline(
                        tx,
                        organizationId,
                        invoice,
                    ),
                },
            },
        };
    },
    sentence: ({ autopay: a }) =>
        `We couldn't take ${a.amount} for ${a.plan} by autopay.`,
    subject: ({ autopay }) =>
        `We couldn't take your payment for ${autopay.plan}`,
    names: ({ autopay }) => ({
        business: autopay.business,
        firstName: autopay.firstName,
    }),
    secretLink: {
        lead: ({ autopay }) =>
            autopay.payOnline
                ? "Pay it by UPI or card here:"
                : "See the invoice and how to pay it here:",
        make: async (tx, organizationId, subject) => {
            const invoiceId = subject.invoiceId ?? "";
            const made = await replacePayTokenInTx(
                tx,
                organizationId,
                invoiceId,
                "ISSUED",
            );
            const invoice = await tx.invoice.findFirst({
                where: { id: invoiceId, organizationId },
                select: { subscriptionId: true },
            });
            if (!made || !invoice?.subscriptionId) {
                // Read as ISSUED on this transaction a moment ago: thrown,
                // so the job is tried again and reads it afresh.
                throw new Error(
                    `Invoice ${invoiceId} changed while its failed-autopay notice was sent`,
                );
            }
            const view = !subject.vars.autopay.payOnline;
            await recordInvoiceEvent(tx, {
                organizationId,
                invoiceId,
                kind: "LINK_MADE",
                actor: JOB_ACTOR,
                ...(view ? { data: { view: true } } : {}),
            });
            await recordSubscriptionEvent(
                tx,
                organizationId,
                invoice.subscriptionId,
                "PAY_LINK_EMAILED",
                JOB,
                { invoiceId, data: { reason: "AUTOPAY_FAILED" } },
            );
            return payLinkUrlFor(organizationId, made.token, tx);
        },
    },
});
