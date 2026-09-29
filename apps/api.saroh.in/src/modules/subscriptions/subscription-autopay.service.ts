import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { fromMinor, toMinor } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { TransactionalRecipient } from "../communications/communications.service";
import { CommunicationsService } from "../communications/communications.service";
import { renderAutopaySetupLink } from "../communications/transactional";
import { formatDay, formatMoney } from "../invoices/invoice-send.service";
import { authorize } from "../organizations/organization-policy";
import type { AutopayCheck } from "../payments/autopay.service";
import { AutopayService } from "../payments/autopay.service";
import {
    autopayChargeInProgress,
    subscriptionChargesUnderWay,
} from "../payments/charge-under-way";
import { LIVE_MANDATE_STATUSES } from "../payments/mandate-cancel-job";
import {
    LINK_SETUP_TTL_MS,
    mandateLimitCents,
    providerName,
} from "../payments/mandate-rules";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { MandatesService } from "../payments/mandates.service";
import type { MandateMethod } from "../payments/providers/provider.port";
import { isMandateMethod } from "../payments/providers/provider.port";
import { teamNames } from "./event-actors";
import {
    recordSubscriptionEvent,
    subscriptionActor,
} from "./subscription-events";

/**
 * Autopay in the workspace (round-2 D14, DEC-038): what staff see of a
 * subscription's autopay beyond D12's line, and the two things they can do
 * about it — send the customer a set-up link, and cancel it. Both need
 * `subscription:write` (the one owner, permission matrix); seeing it needs
 * `subscription:read`.
 *
 * **Behind the provider's rollout flag** (`RAZORPAY_AUTOPAY`): with it off
 * nothing offers autopay — no set-up link (403), no "Send a set-up link",
 * no promise in the copy (`offered` false). A mandate already made can still
 * be seen and cancelled, as the flag's own description says: a live
 * authority to debit must never be hidden from the business that holds it.
 *
 * **The set-up link is the provider's hosted page for one method** (D19's
 * `HOSTED_LINK`, a Razorpay registration link). Staff pick the method from
 * every one the business's account offers (DEC-059: Saroh never narrows
 * it); the customer approves on the provider's page. No `callback_url` is
 * sent: the D11 spike never saw a registration link take one. With nothing
 * to pay, UPI and card take the ₹1 check and refund it (DEC-064).
 */
@Injectable()
export class SubscriptionAutopayService {
    private readonly logger = new Logger(SubscriptionAutopayService.name);

    constructor(
        private readonly autopay: AutopayService,
        private readonly setups: MandateSetupService,
        private readonly mandates: MandatesService,
        // Emailing the link (D17's path); absent where a test builds it by hand.
        @Optional() private readonly comms?: CommunicationsService,
    ) {}

    /**
     * Whether this business offers autopay at all, and how: the workspace's
     * honest copy ("paid by autopay" only when true) and the set-up link's
     * method picker read it.
     */
    async offer(ctx: OrganizationContext): Promise<AutopayOfferView> {
        authorize(ctx, "subscription:read");
        return this.offerOf(ctx.organizationId);
    }

    /** Subscription Detail's autopay card, beyond D12's line (D14). */
    async card(
        organizationId: string,
        subscriptionId: string,
        currency: string,
        now: Date = new Date(),
    ): Promise<AutopayCardView> {
        const offer = await this.offerOf(organizationId, currency);
        const rows = await prisma.paymentMandate.findMany({
            where: { organizationId, subscriptionId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: MANDATE_CARD_SELECT,
        });
        const current =
            rows.find((r) => r.status === "ACTIVE" || r.status === "PAUSED") ??
            rows.find((r) => r.status === "PENDING" || r.status === "FAILED") ??
            null;
        const newest = rows.length > 0 ? rows[0] : null;
        const endedRow =
            newest?.status === "CANCELLED" &&
            !rows.some((r) =>
                (LIVE_MANDATE_STATUSES as readonly string[]).includes(r.status),
            )
                ? newest
                : null;
        // A cancel the provider hasn't confirmed is always said; one it has
        // is said only where autopay is offered (with the flag off, the
        // business sees no autopay at all).
        const ended =
            endedRow && (offer.offered || endedRow.cancelConfirmedAt === null)
                ? {
                      at: (
                          endedRow.cancelledAt ?? endedRow.createdAt
                      ).toISOString(),
                      reason: endedRow.cancelReason,
                      confirmed: endedRow.cancelConfirmedAt !== null,
                  }
                : null;

        return {
            offered: offer.offered,
            methods: offer.methods,
            checks: offer.checks,
            provider:
                (current ?? endedRow)
                    ? providerName((current ?? endedRow)?.provider)
                    : offer.provider,
            setUp: current
                ? await this.setUpOf(organizationId, subscriptionId, current)
                : null,
            ended,
            limitLow: current
                ? await limitLowOf(organizationId, subscriptionId, current)
                : null,
            emailTo: offer.offered
                ? await this.emailTo(organizationId, subscriptionId)
                : null,
            asOf: now.toISOString(),
        };
    }

    /**
     * "Send a set-up link" (D14): a PENDING mandate and the provider's
     * hosted page for `method`, answered once — Saroh keeps the set-up's
     * reference, never the link. Emailed to the customer through D17's
     * transactional path when asked and an address and the business's email
     * provider exist; otherwise staff copy it.
     *
     * The limit covers the larger of the price, a booked plan change and
     * any unpaid invoice, with headroom — so a link sent after "Autopay
     * limit too low" (D13's MANDATE_LIMIT_LOW) covers the renewal that
     * didn't fit. Approving it replaces the old mandate (`mandate-events.ts`).
     */
    async sendLink(
        ctx: OrganizationContext,
        subscriptionId: string,
        input: { method: MandateMethod; email?: boolean },
        now: Date = new Date(),
    ): Promise<AutopayLinkResult> {
        authorize(ctx, "subscription:write");
        const { organizationId } = ctx;
        const sub = await prisma.customerSubscription.findFirst({
            where: { id: subscriptionId, organizationId },
            select: {
                id: true,
                status: true,
                price: true,
                currency: true,
                timezone: true,
                plan: { select: { name: true } },
                pendingPlan: { select: { price: true } },
                contact: { select: { firstName: true } },
            },
        });
        if (!sub) throw new NotFoundException("Subscription not found");
        if (sub.status === "CANCELLED") {
            throw new ConflictException({
                message:
                    "This subscription has ended, so autopay can't be set up for it.",
                details: { reason: "ended" },
            });
        }
        const offer = await this.offerOf(organizationId, sub.currency);
        if (!offer.offered) {
            throw new ForbiddenException({
                message: "Autopay isn't available for this business.",
                details: { reason: "not-offered" },
            });
        }
        if (!offer.methods.includes(input.method)) {
            throw new ConflictException({
                message:
                    "That way to pay isn't available for autopay with this business.",
                details: { reason: "method" },
            });
        }
        // One charge at a time (D13): a new authorisation waits until the
        // charge under way is answered.
        const charging = await subscriptionChargesUnderWay(
            prisma,
            organizationId,
            [sub.id],
        );
        if (charging.has(sub.id)) throw autopayChargeInProgress();

        const unpaid = await prisma.invoice.findMany({
            where: {
                organizationId,
                subscriptionId: sub.id,
                status: "ISSUED",
            },
            select: { total: true },
        });
        const coverCents = Math.max(
            toMinor(sub.price),
            sub.pendingPlan ? toMinor(sub.pendingPlan.price) : 0,
            ...unpaid.map((i) => toMinor(i.total)),
            1,
        );
        const started = await this.setups.createSetup({
            organizationId,
            subscriptionId: sub.id,
            method: input.method,
            maxAmountCents: mandateLimitCents(coverCents),
            firstAmountCents: 0,
            source: "SETUP_LINK",
            handoff: "HOSTED_LINK",
            setupTtlMs: LINK_SETUP_TTL_MS,
            now,
        });
        const url = started.authorisationUrl;
        if (!url) {
            // The provider made it but gave no page to send: nothing to hand
            // the customer, so it can't be approved.
            await prisma.paymentMandate.updateMany({
                where: { id: started.mandateId, status: "PENDING" },
                data: {
                    status: "FAILED",
                    failedAt: now,
                    failureReason: "SETUP_UNANSWERED",
                },
            });
            throw new ServiceUnavailableException(
                `${providerName(started.provider)} didn't give a set-up page. Nothing was sent; try again in a few minutes`,
            );
        }
        const limit = fromMinor(started.maxAmountCents);
        const check: AutopayCheck | null =
            started.checkCents > 0
                ? {
                      amount: fromMinor(started.checkCents),
                      currency: started.currency,
                  }
                : null;

        const emailed = await prisma.$transaction(async (tx) => {
            let sent: AutopayLinkResult["emailed"] = null;
            let emailProblem: string | null = null;
            if (input.email && this.comms) {
                const recipient = await recipientOf(tx, organizationId, sub.id);
                try {
                    const queued = await this.comms.queueTransactional(
                        tx,
                        organizationId,
                        {
                            template: "AUTOPAY_SET_UP_LINK",
                            rendered: renderAutopaySetupLink({
                                business: await businessName(organizationId),
                                firstName: firstNameOf(sub.contact.firstName),
                                plan: sub.plan.name,
                                method: METHOD_WORDS[input.method],
                                limit: formatMoney(limit, started.currency),
                                check: check
                                    ? formatMoney(check.amount, check.currency)
                                    : null,
                                expiresOn: formatDay(
                                    started.setupExpiresAt,
                                    sub.timezone,
                                ),
                            }),
                            recipient,
                            secretLink: () => Promise.resolve(url),
                            createdByUserId: ctx.userId,
                        },
                    );
                    sent = { status: queued.status, to: queued.toAddress };
                } catch (err) {
                    // No address, or no email provider: the link still
                    // stands, for staff to copy.
                    if (!(err instanceof ConflictException)) throw err;
                    emailProblem = err.message;
                }
            }
            await recordSubscriptionEvent(
                tx,
                organizationId,
                sub.id,
                "MANDATE_LINK_SENT",
                subscriptionActor(ctx),
                {
                    data: {
                        method: input.method,
                        limit,
                        currency: started.currency,
                        mandateId: started.mandateId,
                        emailed: sent?.status === "QUEUED",
                    },
                },
            );
            return { sent, emailProblem };
        });

        return {
            url,
            method: input.method,
            limit,
            currency: started.currency,
            check,
            expiresAt: started.setupExpiresAt.toISOString(),
            emailed: emailed.sent,
            emailProblem: emailed.emailProblem,
        };
    }

    /**
     * "Cancel autopay" (D14): ends the subscription's mandate, asking the
     * provider first (D20's `cancelFor`, DEC-026). It is marked CANCELLED in
     * Saroh before the provider is asked, so nothing charges it again
     * whatever the answer; an unsure answer reads "being confirmed" and a
     * job keeps asking. The subscription goes on, its renewals invoiced
     * with a pay link. Already off: says so and changes nothing. A mandate
     * already made is cancelled even with the rollout flag off.
     */
    async cancel(
        ctx: OrganizationContext,
        subscriptionId: string,
    ): Promise<AutopayCancelResult> {
        authorize(ctx, "subscription:write");
        const { organizationId } = ctx;
        const sub = await prisma.customerSubscription.findFirst({
            where: { id: subscriptionId, organizationId },
            select: { id: true },
        });
        if (!sub) throw new NotFoundException("Subscription not found");
        const open = await prisma.paymentMandate.findFirst({
            where: {
                organizationId,
                subscriptionId,
                OR: [
                    { status: { in: [...LIVE_MANDATE_STATUSES] } },
                    { status: "CANCELLED", cancelConfirmedAt: null },
                ],
            },
            orderBy: { createdAt: "desc" },
            select: { provider: true },
        });
        if (!open) {
            return {
                outcome: "ALREADY_OFF",
                provider: null,
            };
        }
        const result = await this.mandates.cancelFor(
            { organizationId, subscriptionId },
            "STAFF",
            { actor: subscriptionActor(ctx) },
        );
        const outcome =
            result.unconfirmed === 0
                ? "CANCELLED"
                : result.refused > 0
                  ? "REFUSED"
                  : "CONFIRMING";
        if (outcome === "REFUSED") {
            this.logger.error(
                `Subscription ${subscriptionId}: autopay is off in Saroh, but ${open.provider} refused the cancel`,
            );
        }
        return { outcome, provider: providerName(open.provider) };
    }

    /**
     * The offer, read once per call; fails closed (`mandateMethods` does).
     * The check's currency is the subscription's, or a mandate's default.
     */
    private async offerOf(
        organizationId: string,
        currency = "INR",
    ): Promise<AutopayOfferView> {
        const offers = await this.setups.mandateMethods(organizationId);
        const methods: MandateMethod[] = [];
        for (const o of offers) {
            for (const m of o.methods)
                if (!methods.includes(m)) methods.push(m);
        }
        const checks =
            methods.length > 0
                ? await this.autopay.checks(organizationId, currency)
                : {};
        return {
            offered: methods.length > 0,
            methods,
            checks,
            provider: offers[0] ? providerName(offers[0].provider) : null,
        };
    }

    /** How the current mandate came to be: from where, by whom, and when. */
    private async setUpOf(
        organizationId: string,
        subscriptionId: string,
        row: CardMandate,
    ): Promise<AutopayCardView["setUp"]> {
        let sentBy: string | null = null;
        if (row.setupSource === "SETUP_LINK") {
            const sent = await prisma.subscriptionEvent.findFirst({
                where: {
                    organizationId,
                    subscriptionId,
                    kind: "MANDATE_LINK_SENT",
                    data: { path: ["mandateId"], equals: row.id },
                },
                select: { actorKind: true, actorUserId: true },
            });
            if (sent?.actorKind === "TEAM" && sent.actorUserId) {
                sentBy =
                    (await teamNames([sent])).get(sent.actorUserId) ?? null;
            } else if (sent?.actorKind === "OPERATOR") {
                sentBy = "Saroh support";
            }
        }
        return {
            source: isSource(row.setupSource) ? row.setupSource : null,
            at: (row.activatedAt ?? row.createdAt).toISOString(),
            sentBy,
        };
    }

    /**
     * Where Saroh would email a set-up link: the address D17 would use for
     * the subscription's latest invoice, else their site account's. Null
     * without the business's own email provider, or with no address.
     */
    private async emailTo(
        organizationId: string,
        subscriptionId: string,
    ): Promise<string | null> {
        if (!this.comms) return null;
        try {
            if (!(await this.comms.emailConnected(prisma, organizationId))) {
                return null;
            }
            const recipient = await recipientOf(
                prisma,
                organizationId,
                subscriptionId,
            );
            const to = await this.comms.transactionalAddress(
                prisma,
                organizationId,
                recipient,
            );
            return to?.address ?? null;
        } catch {
            return null;
        }
    }
}

/** How the email names a method (D14). */
const METHOD_WORDS: Record<MandateMethod, string> = {
    UPI: "UPI app",
    CARD: "card",
    EMANDATE: "bank account",
};

const SOURCES = ["PAY_LINK", "PRICES", "ACCOUNT", "SETUP_LINK"] as const;
type SetUpSource = (typeof SOURCES)[number];
const isSource = (v: string | null): v is SetUpSource =>
    v !== null && (SOURCES as readonly string[]).includes(v);

const MANDATE_CARD_SELECT = {
    id: true,
    status: true,
    provider: true,
    method: true,
    maxAmountCents: true,
    setupSource: true,
    createdAt: true,
    activatedAt: true,
    cancelledAt: true,
    cancelReason: true,
    cancelConfirmedAt: true,
} as const;

type CardMandate = Prisma.PaymentMandateGetPayload<{
    select: typeof MANDATE_CARD_SELECT;
}>;

/**
 * Who the link's email goes to: the bill-to of the subscription's latest
 * issued invoice (D17's first choice), else the contact's site account.
 */
async function recipientOf(
    db: Pick<Prisma.TransactionClient, "invoice" | "customerSubscription">,
    organizationId: string,
    subscriptionId: string,
): Promise<TransactionalRecipient> {
    const invoice = await db.invoice.findFirst({
        where: {
            organizationId,
            subscriptionId,
            status: { in: ["ISSUED", "PAID"] },
        },
        orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
    });
    if (invoice) return { kind: "INVOICE_BILL_TO", invoiceId: invoice.id };
    const sub = await db.customerSubscription.findFirstOrThrow({
        where: { id: subscriptionId, organizationId },
        select: { contactId: true },
    });
    return { kind: "SITE_ACCOUNT", contactId: sub.contactId };
}

/** "Meera", or null for a blank name: the email then says "Hello,". */
function firstNameOf(name: string | null): string | null {
    const trimmed = name?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
}

async function businessName(organizationId: string): Promise<string> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
    });
    return org?.name ?? "Your business";
}

/**
 * "Autopay limit too low" (D13's MANDATE_LIMIT_LOW): the newest such event
 * since the current mandate came on, while its limit is still below that
 * renewal. A new authorisation (D12, or D14's link) with a higher limit
 * clears it.
 */
async function limitLowOf(
    organizationId: string,
    subscriptionId: string,
    row: CardMandate,
): Promise<AutopayCardView["limitLow"]> {
    if (row.status !== "ACTIVE" && row.status !== "PAUSED") return null;
    const since = row.activatedAt ?? row.createdAt;
    const event = await prisma.subscriptionEvent.findFirst({
        where: {
            organizationId,
            subscriptionId,
            kind: "MANDATE_LIMIT_LOW",
            createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        select: { data: true, createdAt: true },
    });
    if (!event) return null;
    const data = (event.data ?? {}) as Record<string, unknown>;
    const amount = typeof data.amount === "string" ? data.amount : null;
    const currency = typeof data.currency === "string" ? data.currency : "INR";
    if (!amount) return null;
    if (row.maxAmountCents !== null && row.maxAmountCents >= toMinor(amount)) {
        return null;
    }
    return {
        limit:
            row.maxAmountCents === null
                ? typeof data.limit === "string"
                    ? data.limit
                    : null
                : fromMinor(row.maxAmountCents),
        amount,
        currency,
        at: event.createdAt.toISOString(),
    };
}

/**
 * The autopay badge on the Subscriptions list (D14, "UPI Autopay · …"):
 * each subscription's ACTIVE or PAUSED mandate, by subscription.
 */
export async function autopayBadges(
    organizationId: string,
    subscriptionIds: readonly string[],
): Promise<Map<string, AutopayBadge>> {
    const out = new Map<string, AutopayBadge>();
    if (subscriptionIds.length === 0) return out;
    const rows = await prisma.paymentMandate.findMany({
        where: {
            organizationId,
            subscriptionId: { in: [...subscriptionIds] },
            status: { in: ["ACTIVE", "PAUSED"] },
        },
        select: {
            subscriptionId: true,
            status: true,
            method: true,
            displayHint: true,
        },
    });
    for (const r of rows) {
        out.set(r.subscriptionId, {
            method: isMandateMethod(r.method) ? r.method : null,
            hint: r.displayHint,
            paused: r.status === "PAUSED",
        });
    }
    return out;
}

/** A subscription's autopay on the list: on (or paused), by what. */
export interface AutopayBadge {
    method: MandateMethod | null;
    /** Only what the provider gave as displayable. */
    hint: string | null;
    /** Paused in the customer's UPI app. */
    paused: boolean;
}

/** Whether, and how, a business offers autopay (D14). */
export interface AutopayOfferView {
    /**
     * The business's provider takes autopay and its rollout flag is on:
     * the workspace may offer it, and its copy may promise it.
     */
    offered: boolean;
    /** Every method the account offers, never narrowed (DEC-059). */
    methods: MandateMethod[];
    /** The ₹1 check each method takes with nothing owed (DEC-064). */
    checks: Partial<Record<MandateMethod, AutopayCheck>>;
    /** The provider as the merchant knows it, when autopay is offered. */
    provider: string | null;
}

/** Subscription Detail's autopay card, beside D12's `autopay` line. */
export interface AutopayCardView extends AutopayOfferView {
    /** How the current mandate came to be; null without one. */
    setUp: {
        /** Where the customer approved it (D12, D14); null: unknown. */
        source: SetUpSource | null;
        /** When it came on (or was started, while pending). */
        at: string;
        /** Who on the team sent the set-up link, for SETUP_LINK. */
        sentBy: string | null;
    } | null;
    /**
     * The last mandate was cancelled and nothing live replaced it: when,
     * why, and whether the provider has confirmed. Null otherwise.
     */
    ended: { at: string; reason: string | null; confirmed: boolean } | null;
    /** D13's "Autopay limit too low", while it still holds. */
    limitLow: {
        limit: string | null;
        amount: string;
        currency: string;
        at: string;
    } | null;
    /** Where a set-up link would be emailed; null: it can only be copied. */
    emailTo: string | null;
    asOf: string;
}

/** What "Send a set-up link" made. The link is shown once. */
export interface AutopayLinkResult {
    url: string;
    method: MandateMethod;
    limit: string;
    currency: string;
    check: AutopayCheck | null;
    expiresAt: string;
    /** Emailed through D17's path; null: not asked for, or couldn't be. */
    emailed: { status: "QUEUED" | "SUPPRESSED"; to: string } | null;
    /** Why it couldn't be emailed, when it was asked for. */
    emailProblem: string | null;
}

/** What "Cancel autopay" did. */
export interface AutopayCancelResult {
    /**
     * CANCELLED: the provider confirmed. CONFIRMING: off in Saroh, the
     * provider's answer is still to come. REFUSED: off in Saroh, but the
     * provider refused — check its dashboard. ALREADY_OFF: nothing to do.
     */
    outcome: "CANCELLED" | "CONFIRMING" | "REFUSED" | "ALREADY_OFF";
    /** "Razorpay"; null when nothing was asked. */
    provider: string | null;
}
