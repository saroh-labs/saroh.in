import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { withGstPaise } from "@saroh/pricing-catalog";

import { appBase } from "../../common/app-url";
import type { EmailOutcome, SarohBillingEmail } from "../../common/email";
import { sendSarohBillingEmail } from "../../common/email";
import { paperDay, paperMoney } from "../invoices/invoice-paper-view";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { BillingEmailPayload } from "./billing-email-payload";
import { parseBillingEmailPayload } from "./billing-email-payload";
import type { RenderedEmail } from "./billing-emails";
import {
    firstMonthEndingEmail,
    invoiceEmail,
    moveDownEmail,
    paymentFailedEmail,
    planEndingEmail,
    termEndingEmail,
    trialEndingEmail,
} from "./billing-emails";
import { paidFirstMonth } from "./offers";
import { MOVE_DOWN_CLAIM_KIND } from "./over-limit";
import { renderSarohInvoicePdf } from "./saroh-invoice-paper";
import { paiseToRupees, SAROH_TIMEZONE } from "./saroh-invoice-terms";
import { sarohSeller } from "./saroh-seller";
import { termEndingOf } from "./term-ending";

type Tx = Prisma.TransactionClient;

/**
 * Saroh's own billing mail to a business (pricing catalogue U17): the
 * invoice for a charge with its PDF, a payment that failed, a first month
 * or a free trial ending (queued by U16), a plan that ends on a date
 * (#805), a 12-month term that ends (DEC-100) and a move to a lower plan
 * that pauses things (#801), all queued by the billing sweep. Written on the caller's transaction (the outbox),
 * so the invoice or the failed charge and its email commit together, and a
 * mail provider that is down never undoes either: a send that fails throws,
 * and the queue retries it with backoff.
 *
 * Re-read, then decide. An invoice already emailed (`emailedAt`) is not
 * sent again. A failed payment that has since been paid, a trial that is
 * no longer one, a plan whose end was moved or taken away, or a term
 * renewed or moved since, says nothing. Each kind sends at most once per event,
 * claimed as a `CustomerNotice` once its email has left.
 *
 * Who hears: everyone on the team whose role manages billing
 * (`billing:manage`, the owner and admins by default), in one message.
 */
export const BILLING_EMAIL_TYPE = "billing.email";

/** The once-only claim on a billing email (`CustomerNotice.kind`). */
export const BILLING_EMAIL_NOTICE_KIND = "SAROH_BILLING_EMAIL";

export type { BillingEmailPayload };

export async function enqueueBillingEmail(
    tx: Pick<Tx, "job">,
    payload: BillingEmailPayload,
    runAt?: Date,
): Promise<void> {
    await tx.job.create({
        data: {
            type: BILLING_EMAIL_TYPE,
            organizationId: payload.organizationId,
            // Plain JSON: strings, numbers, booleans, nulls and lists of them.
            payload: payload as unknown as Prisma.InputJsonObject,
            ...(runAt ? { runAt } : {}),
        },
    });
}

/** DI token: the sender, for a test to watch every send. */
export const SAROH_BILLING_SENDER = Symbol("SAROH_BILLING_SENDER");
export type SarohBillingSender = (
    email: SarohBillingEmail,
) => Promise<EmailOutcome>;

/** The emails of everyone in the business who manages its billing. */
export async function billingRecipients(
    organizationId: string,
): Promise<string[]> {
    const [members, roles] = await Promise.all([
        prisma.membership.findMany({
            where: { organizationId },
            select: {
                role: true,
                extraActions: true,
                user: { select: { email: true } },
            },
            orderBy: { userId: "asc" },
        }),
        prisma.organizationRole.findMany({
            where: { organizationId },
            select: { key: true, actions: true },
        }),
    ]);
    const to = members
        .filter((m) =>
            resolveCapabilities(
                m.role,
                roles.find((r) => r.key === m.role)?.actions ?? null,
                m.extraActions,
            ).has("billing:manage"),
        )
        .map((m) => m.user.email.trim())
        .filter((e) => e !== "");
    return [...new Set(to)];
}

const money = (paise: number) => paperMoney(paiseToRupees(paise), "INR");
const day = (d: Date) => paperDay(d.toISOString(), SAROH_TIMEZONE);

@Injectable()
export class BillingEmailHandler {
    private readonly logger = new Logger(BillingEmailHandler.name);

    constructor(
        @Optional()
        @Inject(SAROH_BILLING_SENDER)
        private readonly send: SarohBillingSender = sendSarohBillingEmail,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = parseBillingEmailPayload(job.payload);
        if (!p) {
            this.logger.error(`billing_email_bad_payload job=${job.id}`);
            return;
        }
        if (p.kind === "INVOICE") return this.invoice(job, p);
        if (p.kind === "PLAN_ENDING") return this.planEnding(job, p);
        if (p.kind === "TERM_ENDING") return this.termEnding(job, p);
        if (p.kind === "MOVE_DOWN") return this.moveDown(job, p);
        return this.notice(job, p);
    };

    private async invoice(
        job: Job,
        p: Extract<BillingEmailPayload, { kind: "INVOICE" }>,
    ): Promise<void> {
        const invoice = await prisma.sarohInvoice.findFirst({
            where: { id: p.invoiceId, organizationId: p.organizationId },
            include: { lines: true },
        });
        if (!invoice) return this.skip(job, "invoice_gone");
        if (invoice.emailedAt) return this.skip(job, "already_sent");
        const org = await prisma.organization.findUnique({
            where: { id: p.organizationId },
            select: { name: true },
        });
        const words = invoiceEmail({
            businessName: org?.name ?? "your business",
            number: invoice.number,
            planName: invoice.planName,
            total: money(invoice.totalPaise),
            period:
                invoice.periodStart && invoice.periodEnd
                    ? `${day(invoice.periodStart)} to ${day(invoice.periodEnd)}`
                    : null,
        });
        const { file, fileName } = await renderSarohInvoicePdf(invoice);
        const sent = await this.deliver(job, p.organizationId, words, [
            { filename: fileName, content: file },
        ]);
        if (!sent) return;
        await prisma.sarohInvoice.updateMany({
            where: { id: invoice.id, emailedAt: null },
            data: { emailedAt: new Date() },
        });
    }

    /**
     * A notice sent at most once per event: already claimed says nothing;
     * `compose` re-reads and returns the words, or why it says nothing;
     * the claim is written once the email has left.
     */
    private async once(
        job: Job,
        organizationId: string,
        eventKey: string,
        compose: () => Promise<RenderedEmail | string>,
    ): Promise<void> {
        const told = await prisma.customerNotice.findUnique({
            where: { organizationId_eventKey: { organizationId, eventKey } },
            select: { id: true },
        });
        if (told) return this.skip(job, "already_sent");
        const words = await compose();
        if (typeof words === "string") return this.skip(job, words);
        if (!(await this.deliver(job, organizationId, words))) return;
        await prisma.customerNotice.createMany({
            data: [
                { organizationId, eventKey, kind: BILLING_EMAIL_NOTICE_KIND },
            ],
            skipDuplicates: true,
        });
    }

    private notice(
        job: Job,
        p: Extract<
            BillingEmailPayload,
            { kind: "PAYMENT_FAILED" | "TRIAL_ENDING" }
        >,
    ): Promise<void> {
        const eventKey =
            p.kind === "PAYMENT_FAILED"
                ? `saroh-billing:payment-failed:${p.eventKey}`
                : `saroh-billing:trial-ending:${p.subscriptionId}:${p.endsAt}`;
        return this.once(job, p.organizationId, eventKey, async () => {
            const sub = await prisma.subscription.findFirst({
                where: {
                    id: p.subscriptionId,
                    organizationId: p.organizationId,
                },
                select: {
                    status: true,
                    currentPeriodEnd: true,
                    provider: true,
                    providerSubscriptionId: true,
                    plan: { select: { name: true, priceCents: true } },
                    organization: { select: { name: true } },
                },
            });
            if (!sub) return "subscription_gone";
            const businessName = sub.organization.name;
            if (p.kind === "PAYMENT_FAILED") {
                // Paid since (a retry went through): nothing to say.
                if (sub.status === "ACTIVE" && !p.final) return "paid_since";
                return paymentFailedEmail({
                    businessName,
                    planName: sub.plan.name,
                    final: p.final,
                });
            }
            const endsAt = new Date(p.endsAt);
            if (
                sub.status !== "TRIALING" ||
                sub.currentPeriodEnd?.getTime() !== endsAt.getTime()
            ) {
                return "not_trialing";
            }
            // What the first charge will be: the plan, less a coupon the
            // trial's checkout carries (U16).
            const checkout =
                sub.provider && sub.providerSubscriptionId
                    ? await prisma.billingCheckout.findUnique({
                          where: {
                              provider_providerSubscriptionId: {
                                  provider: sub.provider,
                                  providerSubscriptionId:
                                      sub.providerSubscriptionId,
                              },
                          },
                          select: {
                              discountPaise: true,
                              discountCharges: true,
                          },
                      })
                    : null;
            const off =
                checkout && checkout.discountCharges > 0
                    ? checkout.discountPaise
                    : 0;
            const input = {
                businessName,
                planName: sub.plan.name,
                endsOn: day(endsAt),
                total: money(
                    withGstPaise(Math.max(0, sub.plan.priceCents - off)),
                ),
            };
            // DEC-093's nominal first month, or a free trial still running.
            return (await paidFirstMonth(prisma, p.organizationId))
                ? firstMonthEndingEmail(input)
                : trialEndingEmail(input);
        });
    }

    /**
     * A plan's end, 30, 7 or 1 days ahead. Re-read: an override taken away,
     * moved to another end, or no longer the one the business reads (a
     * newer one replaced it) says nothing; the sweep tells the new end.
     */
    private planEnding(
        job: Job,
        p: Extract<BillingEmailPayload, { kind: "PLAN_ENDING" }>,
    ): Promise<void> {
        const eventKey = `saroh-billing:plan-ending:${p.overrideId}:${p.endsAt}:${p.stage}`;
        return this.once(job, p.organizationId, eventKey, async () => {
            // The plan override the business reads now (newest live, as
            // `newestPlanOverride`): still this one, with the same end.
            const now = new Date();
            const override = await prisma.entitlementOverride.findFirst({
                where: {
                    organizationId: p.organizationId,
                    kind: "plan",
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    expiresAt: true,
                    organization: { select: { name: true } },
                },
            });
            if (
                override?.id !== p.overrideId ||
                override.expiresAt?.toISOString() !== p.endsAt
            ) {
                return "plan_end_changed";
            }
            return planEndingEmail({
                businessName: override.organization.name,
                planName: p.planName,
                nextPlanName: p.nextPlanName,
                endsOn: p.endsOn,
                pauses: p.pauses,
            });
        });
    }

    /**
     * A 12-month term's end, 30, 7 or 1 days ahead (DEC-100). Re-read with
     * the sweep's own rule (`termEndingOf`): a term renewed or another plan
     * authorised since, a move that takes over first, or an end that moved
     * says nothing. The price is the plan's on the live catalogue now.
     */
    private termEnding(
        job: Job,
        p: Extract<BillingEmailPayload, { kind: "TERM_ENDING" }>,
    ): Promise<void> {
        const eventKey = `saroh-billing:term-ending:${p.subscriptionId}:${p.endsAt}:${p.stage}`;
        return this.once(job, p.organizationId, eventKey, async () => {
            const ending = await termEndingOf(
                prisma,
                p.subscriptionId,
                new Date(),
            );
            if (
                ending?.organizationId !== p.organizationId ||
                ending.term.endsAt.toISOString() !== p.endsAt
            ) {
                return "term_end_changed";
            }
            const org = await prisma.organization.findUnique({
                where: { id: p.organizationId },
                select: { name: true },
            });
            return termEndingEmail({
                businessName: org?.name ?? "your business",
                planName: ending.planName,
                endsOn: day(ending.term.endsAt),
                payment: ending.term.payment,
                price:
                    ending.nextPricePaise === null
                        ? null
                        : money(ending.nextPricePaise),
                payUrl: `${appBase()}/settings/billing#change-plan`,
                chosenFree: ending.chosenFree,
                pauses: p.pauses,
            });
        });
    }

    /**
     * A move to a lower plan that pauses things (#801): what the sweep
     * listed, sent once. Re-read: once its grace claim is gone (the
     * business moved back up, or is no longer over), it says nothing.
     */
    private moveDown(
        job: Job,
        p: Extract<BillingEmailPayload, { kind: "MOVE_DOWN" }>,
    ): Promise<void> {
        const eventKey = `saroh-billing:${p.eventKey}`;
        return this.once(job, p.organizationId, eventKey, async () => {
            const claim = await prisma.customerNotice.findUnique({
                where: {
                    organizationId_eventKey: {
                        organizationId: p.organizationId,
                        eventKey: p.graceKey,
                    },
                },
                select: { kind: true },
            });
            if (claim?.kind !== MOVE_DOWN_CLAIM_KIND) return "moved_up_since";
            const org = await prisma.organization.findUnique({
                where: { id: p.organizationId },
                select: { name: true },
            });
            return moveDownEmail({
                businessName: org?.name ?? "your business",
                mode: p.mode,
                planName: p.planName,
                nextPlanName: p.nextPlanName,
                movesOn: p.movesOn,
                pausesOn: p.pausesOn,
                lines: p.lines,
                url: `${appBase()}/settings/billing#change-plan`,
            });
        });
    }

    /**
     * Send to the business's billing people. True once it left; a failure
     * throws so the queue retries; no recipient or no mail set up is logged
     * and ends the job (nothing a retry would change).
     */
    private async deliver(
        job: Job,
        organizationId: string,
        words: RenderedEmail,
        attachments?: SarohBillingEmail["attachments"],
    ): Promise<boolean> {
        const to = await billingRecipients(organizationId);
        if (to.length === 0) {
            this.skip(job, "no_recipient");
            return false;
        }
        const outcome = await this.send({
            to,
            subject: words.subject,
            html: words.html,
            replyTo: sarohSeller().email,
            ...(attachments ? { attachments } : {}),
        });
        if (outcome === "failed") {
            throw new Error(`billing_email_send_failed job=${job.id}`);
        }
        if (outcome === "not-configured") {
            this.logger.warn(
                `billing_email_not_configured job=${job.id} org=${organizationId}`,
            );
            return false;
        }
        return true;
    }

    private skip(job: Job, reason: string): void {
        this.logger.log(`billing_email_skipped job=${job.id} reason=${reason}`);
    }
}
