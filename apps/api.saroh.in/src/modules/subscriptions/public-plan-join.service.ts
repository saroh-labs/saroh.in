import {
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { planStartsSubscriptions } from "../billing/online-payments-plan";
import { takesOnlinePayment } from "../bookings/public-booking-page";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { contactName } from "../invoices/serialize";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import type { AutopayStart } from "../payments/autopay.service";
import { AutopayService } from "../payments/autopay.service";
import type { CreateIntentResult } from "../payments/payments.service";
import { PaymentsService } from "../payments/payments.service";
import type { MandateMethod } from "../payments/providers/provider.port";
import { OPENS_CHECKOUT } from "../payments/public-key";
import { siteOriginOf } from "../sites/site-origin";
import {
    createPlanJoinDraftInTx,
    MAX_OPEN_PLAN_JOINS,
    openPlanJoinsWhere,
    PLAN_JOIN_REPLACED_REASON,
    planTermsOf,
    readPlanTerms,
    samePlanTerms,
} from "./plan-join";
import { PLAN_ON_SALE } from "./plan-on-sale";
import { paymentsOffered } from "./public-plans.service";
import type { CustomerScope } from "./subscriptions.service";

/**
 * Joining a plan online from the site's Prices page or Plans block (round-2
 * G20; ADR-011), at `public/site-accounts/me/plans`. Built as A11 buys a
 * pack (`class-packs/public-pack-purchase.service.ts`):
 *
 * - **Only what is on sale.** Payments must be rolled out and on for the
 *   business (DEC-057), and the plan published and not archived (D21).
 *   Anything else is a 404, as a plan that isn't there: a draft is never
 *   joined.
 * - **Priced by the server.** The customer names a plan and nothing else;
 *   the draft invoice takes the plan's published price and terms as they
 *   are now (`plan-join.ts`), and the intent's amount is the draft's.
 * - **Paid before anyone joins.** The intent is made by
 *   `PaymentsService.createIntentForInvoicePublic` on the business's own
 *   provider, whose window shows the methods the business's account has on
 *   (DEC-059); the webhook starts the subscription. No provider that can
 *   open a window: nothing is made, and the site offers "Ask about
 *   joining" instead.
 * - **Autopay, when chosen** (D12). UPI or card: one window pays the
 *   first period and authorises (`AutopayService.startForJoin`), and the
 *   mandate starts with the subscription. eMandate: the join is paid as
 *   usual, and the sheet authorises once joined, from the account.
 *   Without it, each renewal is invoiced as any member's is.
 * - **Few open at once.** Starting the same plan again, on the same terms,
 *   reuses its draft; a draft whose plan has changed since is voided and
 *   started again. At most {@link MAX_OPEN_PLAN_JOINS} different plans
 *   wait to be paid at once.
 *
 * Every read and write is scoped to the signed-in customer's business and
 * contact; another customer's attempt is a 404. It runs in the business's
 * RLS context (`OrgRlsInterceptor`, from `customerContext`).
 */

/** Join starts per account per ten minutes: retries, not a flood. */
const STARTS_PER_WINDOW = 10;
const START_WINDOW_MS = 10 * 60_000;

/** Said when the business takes no payment online. */
export const ASK_ABOUT_JOINING =
    "This business isn't taking payments online right now. Ask them about joining.";

/** Said to a fourth open join (409). */
export const TOO_MANY_OPEN_JOINS = `You've started joining ${MAX_OPEN_PLAN_JOINS} plans without paying. Finish one of those, or try again tomorrow.`;

/** Said when the customer is on the plan already (409). */
export function alreadyOnPlan(name: string): string {
    return `You're already on ${name}. See it in your account.`;
}

/** A started join: what is being paid, and the provider's handoff. */
export interface AccountPlanJoin {
    /** The attempt's ref, to ask how it stands. */
    ref: string;
    plan: { name: string; interval: string };
    total: string;
    currency: string;
    payment: CreateIntentResult;
    /**
     * Autopay chosen with the join (D12): the same window also authorises
     * (UPI, card). Null: a plain payment.
     */
    autopay: AutopayStart | null;
}

/** How a started join stands. */
export interface AccountPlanJoinAttempt {
    state: "paying" | "joined" | "closed";
    plan: { name: string };
    /** Once joined: the new plan's ref, to set autopay up on it (D12). */
    subscriptionRef?: string | null;
}

function notFound(): never {
    throw new NotFoundException("Plan not found");
}

@Injectable()
export class PublicPlanJoinService {
    constructor(
        private readonly payments: PaymentsService,
        @Optional()
        private readonly startLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            STARTS_PER_WINDOW,
            START_WINDOW_MS,
        ),
        // Autopay chosen with the join (D12); absent where a test builds
        // this by hand, and then only a plain payment is offered.
        @Optional() private readonly autopay?: AutopayService,
    ) {}

    /**
     * Start paying to join a plan: its draft invoice (reused when one on the
     * same terms is waiting) and an intent for it. The same idempotency key
     * on the same draft returns the same intent.
     */
    async start(
        customer: CustomerScope & { siteId?: string },
        ref: string,
        idempotencyKey: string | undefined,
        now: Date = new Date(),
        autopayMethod?: MandateMethod,
    ): Promise<AccountPlanJoin> {
        const { organizationId, contactId } = customer;
        if (!this.startLimiter.take(customer.accountId)) {
            throw new HttpException(
                "Too many tries just now. Wait a few minutes, then try again.",
                429,
            );
        }
        await assertOrganizationOpen(organizationId);
        if (!(await paymentsOffered(organizationId))) notFound();
        // The published columns only: never `pendingChanges`.
        const plan = await prisma.subscriptionPlan.findFirst({
            where: { id: ref, organizationId },
            select: {
                id: true,
                name: true,
                price: true,
                currency: true,
                interval: true,
                classesPerMonth: true,
                status: true,
            },
        });
        // A draft isn't published and an archived plan takes nobody new: to
        // the customer both are plans that aren't there.
        if (plan?.status !== PLAN_ON_SALE) notFound();
        const terms = planTermsOf(plan, customer.accountId);
        if (!terms) notFound();

        const provider = await prisma.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            orderBy: { createdAt: "asc" },
            select: { provider: true },
        });
        // A new subscription: the plan must start one (memberships and
        // online payments); said to the customer without naming a plan.
        if (
            !provider ||
            !(await takesOnlinePayment(organizationId)) ||
            !(await planStartsSubscriptions(organizationId))
        ) {
            throw new ConflictException({
                message: ASK_ABOUT_JOINING,
                details: { reason: "ask" },
            });
        }

        const draft = await prisma.$transaction(async (tx) => {
            // One start at a time per customer, so two tabs can't both slip
            // under the open-joins limit, or join twice.
            await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contactId} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
            const live = await tx.customerSubscription.count({
                where: {
                    organizationId,
                    planId: plan.id,
                    contactId,
                    status: { not: "CANCELLED" },
                },
            });
            if (live > 0) {
                throw new ConflictException({
                    message: alreadyOnPlan(plan.name),
                    details: { reason: "already-on" },
                });
            }
            const open = await tx.invoice.findMany({
                where: openPlanJoinsWhere(organizationId, contactId, now),
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    total: true,
                    currency: true,
                    planTerms: true,
                },
            });
            const same = open.find((d) => {
                const t = readPlanTerms(d.planTerms);
                return t !== null && samePlanTerms(t, terms);
            });
            if (same) return same;
            // This plan's older drafts no longer match what is on sale.
            const stale = open.filter(
                (d) => readPlanTerms(d.planTerms)?.planId === terms.planId,
            );
            if (stale.length > 0) {
                await tx.invoice.updateMany({
                    where: {
                        id: { in: stale.map((d) => d.id) },
                        status: "DRAFT",
                    },
                    data: {
                        status: "VOID",
                        voidedAt: now,
                        voidReason: PLAN_JOIN_REPLACED_REASON,
                    },
                });
            }
            if (open.length - stale.length >= MAX_OPEN_PLAN_JOINS) {
                throw new ConflictException({
                    message: TOO_MANY_OPEN_JOINS,
                    details: { reason: "too-many" },
                });
            }
            const [contact, account] = await Promise.all([
                tx.contact.findFirst({
                    where: { id: contactId, organizationId },
                    select: { firstName: true, lastName: true, email: true },
                }),
                tx.customerAccount.findFirst({
                    where: { id: customer.accountId, organizationId },
                    select: { email: true },
                }),
            ]);
            if (!contact) notFound();
            const name = contactName(contact).trim();
            return createPlanJoinDraftInTx(tx, {
                organizationId,
                contactId,
                billToName: name.length > 0 ? name : null,
                billToEmail: contactEmailForDisplay(
                    contact.email,
                    account?.email,
                ),
                terms,
            });
        });

        const summary = {
            ref: draft.id,
            plan: { name: terms.name, interval: terms.interval },
            total: toMoneyString(draft.total.toString()),
            currency: draft.currency,
        };
        // Autopay by UPI or card: one window pays and authorises (D12).
        if (autopayMethod && autopayMethod !== "EMANDATE") {
            if (!this.autopay) {
                throw new ConflictException({
                    message: "Autopay isn't available with this business.",
                    details: { reason: "not-offered" },
                });
            }
            const origin = await siteOriginOf(
                organizationId,
                customer.siteId ? { siteId: customer.siteId } : {},
            );
            const { start, paymentIntentId } = await this.autopay.startForJoin({
                organizationId,
                contactId,
                draft,
                plan: { name: terms.name, price: terms.price },
                method: autopayMethod,
                ...(idempotencyKey ? { idempotencyKey } : {}),
                returnUrl: origin
                    ? `${origin}/autopay?join=${encodeURIComponent(draft.id)}`
                    : null,
                now,
            });
            return {
                ...summary,
                payment: {
                    paymentIntentId,
                    provider: start.handoff.provider,
                    providerIntentId: start.handoff.providerIntentId ?? "",
                    amountCents: start.handoff.amountCents,
                    currency: start.handoff.currency,
                    publicKey: start.handoff.publicKey,
                    clientParams: start.handoff.clientParams,
                },
                autopay: start,
            };
        }
        const payment = await this.payments.createIntentForInvoicePublic(
            {
                id: draft.id,
                organizationId,
                total: draft.total,
                currency: draft.currency,
            },
            { idempotencyKey, provider: provider.provider },
        );
        return { ...summary, payment, autopay: null };
    }

    /** How a started join stands; another customer's is a 404. */
    async standing(
        customer: CustomerScope,
        ref: string,
    ): Promise<AccountPlanJoinAttempt> {
        const row = await prisma.invoice.findFirst({
            where: {
                id: ref,
                organizationId: customer.organizationId,
                contactId: customer.contactId,
                kind: "INVOICE",
                source: "SUBSCRIPTION",
            },
            select: { status: true, planTerms: true, subscriptionId: true },
        });
        const terms = readPlanTerms(row?.planTerms);
        // A period's invoice the desk issued has no snapshot: not a join.
        if (!row || !terms) {
            throw new NotFoundException("Plan payment not found");
        }
        const state =
            row.status === "DRAFT"
                ? "paying"
                : row.status === "PAID"
                  ? "joined"
                  : "closed";
        return {
            state,
            plan: { name: terms.name },
            ...(state === "joined"
                ? { subscriptionRef: row.subscriptionId }
                : {}),
        };
    }
}
