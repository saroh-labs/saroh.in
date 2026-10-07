import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { withGstPaise } from "@saroh/pricing-catalog";

import type { EmailOutcome, SarohBillingEmail } from "../../common/email";
import { sendSarohBillingEmail } from "../../common/email";
import { paperDay, paperMoney } from "../invoices/invoice-paper-view";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { RenderedEmail } from "./billing-emails";
import {
    invoiceEmail,
    paymentFailedEmail,
    planEndingEmail,
    trialEndingEmail,
} from "./billing-emails";
import type { PlanEndingStage } from "./plan-ending";
import { PLAN_ENDING_NOTICE_DAYS } from "./plan-ending";
import { renderSarohInvoicePdf } from "./saroh-invoice-paper";
import { paiseToRupees, SAROH_TIMEZONE } from "./saroh-invoice-terms";
import { sarohSeller } from "./saroh-seller";

type Tx = Prisma.TransactionClient;

/**
 * Saroh's own billing mail to a business (pricing catalogue U17): the
 * invoice for a charge with its PDF, a payment that failed, a trial ending
 * (queued by U16), and a plan that ends on a date (#805, queued by the
 * billing sweep). Written on the caller's transaction (the outbox),
 * so the invoice or the failed charge and its email commit together, and a
 * mail provider that is down never undoes either: a send that fails throws,
 * and the queue retries it with backoff.
 *
 * Re-read, then decide. An invoice already emailed (`emailedAt`) is not
 * sent again. A failed payment that has since been paid, a trial that is
 * no longer one, or a plan whose end was moved or taken away, says nothing. Each kind sends at most once per event,
 * claimed as a `CustomerNotice` once its email has left.
 *
 * Who hears: everyone on the team whose role manages billing
 * (`billing:manage`, the owner and admins by default), in one message.
 */
export const BILLING_EMAIL_TYPE = "billing.email";

/** The once-only claim on a billing email (`CustomerNotice.kind`). */
export const BILLING_EMAIL_NOTICE_KIND = "SAROH_BILLING_EMAIL";

export type BillingEmailPayload =
    | { kind: "INVOICE"; organizationId: string; invoiceId: string }
    | {
          kind: "PAYMENT_FAILED";
          organizationId: string;
          subscriptionId: string;
          /** The provider event that said so: one email per event. */
          eventKey: string;
          /** The provider gave up and the business is on Free. */
          final: boolean;
      }
    | {
          kind: "TRIAL_ENDING";
          organizationId: string;
          subscriptionId: string;
          /** When the trial ends, ISO: one email per trial end. */
          endsAt: string;
      }
    | {
          kind: "PLAN_ENDING";
          organizationId: string;
          /** The `plan` override that ends. */
          overrideId: string;
          /** Its end, ISO: one email per end and stage. */
          endsAt: string;
          stage: PlanEndingStage;
          planName: string;
          nextPlanName: string;
          /** The end in the business's words ("16 Nov 2026"). */
          endsOn: string;
      };

export async function enqueueBillingEmail(
    tx: Pick<Tx, "job">,
    payload: BillingEmailPayload,
    runAt?: Date,
): Promise<void> {
    await tx.job.create({
        data: {
            type: BILLING_EMAIL_TYPE,
            organizationId: payload.organizationId,
            payload,
            ...(runAt ? { runAt } : {}),
        },
    });
}

/** DI token: the sender, for a test to watch every send. */
export const SAROH_BILLING_SENDER = Symbol("SAROH_BILLING_SENDER");
export type SarohBillingSender = (
    email: SarohBillingEmail,
) => Promise<EmailOutcome>;

function parsePayload(payload: unknown): BillingEmailPayload | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.organizationId !== "string") return null;
    if (p.kind === "INVOICE" && typeof p.invoiceId === "string") {
        return p as unknown as BillingEmailPayload;
    }
    if (
        p.kind === "PAYMENT_FAILED" &&
        typeof p.subscriptionId === "string" &&
        typeof p.eventKey === "string"
    ) {
        return { ...(p as object), final: p.final === true } as never;
    }
    if (
        p.kind === "TRIAL_ENDING" &&
        typeof p.subscriptionId === "string" &&
        typeof p.endsAt === "string"
    ) {
        return p as unknown as BillingEmailPayload;
    }
    if (
        p.kind === "PLAN_ENDING" &&
        typeof p.overrideId === "string" &&
        typeof p.endsAt === "string" &&
        PLAN_ENDING_NOTICE_DAYS.includes(p.stage as PlanEndingStage) &&
        typeof p.planName === "string" &&
        typeof p.nextPlanName === "string" &&
        typeof p.endsOn === "string"
    ) {
        return p as unknown as BillingEmailPayload;
    }
    return null;
}

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
        const p = parsePayload(job.payload);
        if (!p) {
            this.logger.error(`billing_email_bad_payload job=${job.id}`);
            return;
        }
        if (p.kind === "INVOICE") return this.invoice(job, p);
        if (p.kind === "PLAN_ENDING") return this.planEnding(job, p);
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

    private async notice(
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
        const told = await prisma.customerNotice.findUnique({
            where: {
                organizationId_eventKey: {
                    organizationId: p.organizationId,
                    eventKey,
                },
            },
            select: { id: true },
        });
        if (told) return this.skip(job, "already_sent");

        const sub = await prisma.subscription.findFirst({
            where: { id: p.subscriptionId, organizationId: p.organizationId },
            select: {
                status: true,
                currentPeriodEnd: true,
                provider: true,
                providerSubscriptionId: true,
                plan: { select: { name: true, priceCents: true } },
                organization: { select: { name: true } },
            },
        });
        if (!sub) return this.skip(job, "subscription_gone");
        const businessName = sub.organization.name;

        let words: RenderedEmail;
        if (p.kind === "PAYMENT_FAILED") {
            // Paid since (a retry went through): nothing to say.
            if (sub.status === "ACTIVE" && !p.final) {
                return this.skip(job, "paid_since");
            }
            words = paymentFailedEmail({
                businessName,
                planName: sub.plan.name,
                final: p.final,
            });
        } else {
            const endsAt = new Date(p.endsAt);
            if (
                sub.status !== "TRIALING" ||
                sub.currentPeriodEnd?.getTime() !== endsAt.getTime()
            ) {
                return this.skip(job, "not_trialing");
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
            words = trialEndingEmail({
                businessName,
                planName: sub.plan.name,
                endsOn: day(endsAt),
                total: money(
                    withGstPaise(Math.max(0, sub.plan.priceCents - off)),
                ),
            });
        }
        if (!(await this.deliver(job, p.organizationId, words))) return;
        await prisma.customerNotice.createMany({
            data: [
                {
                    organizationId: p.organizationId,
                    eventKey,
                    kind: BILLING_EMAIL_NOTICE_KIND,
                },
            ],
            skipDuplicates: true,
        });
    }

    /**
     * A plan's end, 30, 7 or 1 days ahead. Re-read: an override taken away,
     * moved to another end, or no longer the one the business reads (a
     * newer one replaced it) says nothing; the sweep tells the new end.
     */
    private async planEnding(
        job: Job,
        p: Extract<BillingEmailPayload, { kind: "PLAN_ENDING" }>,
    ): Promise<void> {
        const eventKey = `saroh-billing:plan-ending:${p.overrideId}:${p.endsAt}:${p.stage}`;
        const told = await prisma.customerNotice.findUnique({
            where: {
                organizationId_eventKey: {
                    organizationId: p.organizationId,
                    eventKey,
                },
            },
            select: { id: true },
        });
        if (told) return this.skip(job, "already_sent");
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
            return this.skip(job, "plan_end_changed");
        }
        const words = planEndingEmail({
            businessName: override.organization.name,
            planName: p.planName,
            nextPlanName: p.nextPlanName,
            endsOn: p.endsOn,
        });
        if (!(await this.deliver(job, p.organizationId, words))) return;
        await prisma.customerNotice.createMany({
            data: [
                {
                    organizationId: p.organizationId,
                    eventKey,
                    kind: BILLING_EMAIL_NOTICE_KIND,
                },
            ],
            skipDuplicates: true,
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
