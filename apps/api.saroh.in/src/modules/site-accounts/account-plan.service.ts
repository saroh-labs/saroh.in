import {
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { payLinkUrl } from "../invoices/pay-link-url";
import { AutopayService } from "../payments/autopay.service";
import type { MandateMethod } from "../payments/providers/provider.port";
import { ALLOWANCE_SELECT } from "../subscriptions/classes-allowance";
import type { PauseWeeks } from "../subscriptions/dto";
import { PAUSE_WEEKS } from "../subscriptions/dto";
import {
    overdueInvoiceOf,
    takesPaymentOnline,
} from "../subscriptions/member-invoices";
import { paymentsOffered } from "../subscriptions/public-plans.service";
import { membersCanPause } from "../subscriptions/subscription-settings";
import type { CustomerScope } from "../subscriptions/subscriptions.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { membershipMonth } from "./account-home-reads";
import { block } from "./account-home.service";
import type {
    AccountPack,
    AccountPlanChange,
    AccountPlanTab,
    AccountSubscription,
} from "./customer-view";
import {
    accountPackView,
    planMessages,
    subscriptionView,
} from "./customer-view";

/**
 * The account's Plan tab (round-2 plan A, A8; ADR-011): the member's plans
 * and packs, and what they may do to a plan themselves — pause for 2, 4 or
 * 8 weeks (when the business lets them), resume, cancel at the period's
 * end, and pay an overdue invoice through a fresh link. There is no plan
 * change (default 8) and no autopay until D12.
 *
 * Every action finds the subscription by id **and** the signed-in
 * customer's contact (`SubscriptionsService.*ForCustomer`), so another
 * customer's plan — even in the same business — is a 404, and each change
 * is recorded in the subscription's log (D9) as the customer, from their
 * account. Everything leaves through `customer-view.ts`.
 */

/**
 * Whether an autopay charge is under way on an invoice (D13), when "Pay now"
 * is hidden and a pay-link request is a 409. D13 isn't built yet, so the
 * default says never; D13 provides the real check under this token.
 */
export const AUTOPAY_CHARGE_PENDING = Symbol("AUTOPAY_CHARGE_PENDING");
export type AutopayChargePending = (
    organizationId: string,
    invoiceId: string,
) => Promise<boolean>;
export const NO_AUTOPAY_YET: AutopayChargePending = () =>
    Promise.resolve(false);

/** The most plans the tab lists; a person is rarely on more than one. */
const PLAN_ROWS = 10;
/** The most packs the tab lists, soonest to expire first. */
const PACK_ROWS = 20;

/** Said when the business has turned members' pausing off (403). */
export const PAUSE_OFF =
    "Pausing from your account is off. Ask the business to pause your plan.";

@Injectable()
export class AccountPlanService {
    constructor(
        private readonly subscriptions: SubscriptionsService,
        @Optional()
        @Inject(AUTOPAY_CHARGE_PENDING)
        private readonly chargePending: AutopayChargePending = NO_AUTOPAY_YET,
        // Autopay on My plan (D12); absent where a test builds this by hand.
        @Optional() private readonly autopay?: AutopayService,
    ) {}

    // ---- Reading ---------------------------------------------------------

    async tab(
        member: CustomerScope,
        now: Date = new Date(),
    ): Promise<AccountPlanTab> {
        const pausing = await membersCanPause(member.organizationId);
        const [subscriptions, packs] = await Promise.all([
            block("plan-subscriptions", () => this.plans(member, pausing, now)),
            block("plan-packs", () => this.packs(member, now)),
        ]);
        const autopayMethods = await this.autopayMethods(member, subscriptions);
        return {
            subscriptions,
            packs,
            pauseWeeks: pausing ? [...PAUSE_WEEKS] : [],
            autopayMethods,
            autopayChecks: await this.autopayChecks(
                member,
                subscriptions,
                autopayMethods,
            ),
        };
    }

    /**
     * The ₹1 check each offered method takes with nothing owed (DEC-064),
     * so the sheet says so before they pick. None when autopay isn't
     * offered; a provider that can't say is none, never a guess.
     */
    private async autopayChecks(
        member: CustomerScope,
        subscriptions: AccountPlanTab["subscriptions"],
        methods: MandateMethod[],
    ): Promise<AccountPlanTab["autopayChecks"]> {
        if (!this.autopay || methods.length === 0) return {};
        const currency =
            (subscriptions.ok ? subscriptions.value[0]?.currency : null) ??
            "INR";
        return this.autopay
            .checks(member.organizationId, currency)
            .catch(() => ({}));
    }

    /**
     * What the business's provider can take autopay with (D12), asked only
     * when the member has a plan to put it on. A provider that can't say
     * offers none.
     */
    private async autopayMethods(
        member: CustomerScope,
        subscriptions: AccountPlanTab["subscriptions"],
    ): Promise<MandateMethod[]> {
        if (!this.autopay) return [];
        if (!subscriptions.ok || subscriptions.value.length === 0) return [];
        // Autopay is a way to pay: only while Payments is on (DEC-057).
        if (!(await paymentsOffered(member.organizationId))) return [];
        return this.autopay.offer(member.organizationId).catch(() => []);
    }

    /** The member's live plans (on or paused), newest first. */
    private async plans(
        member: CustomerScope,
        pausing: boolean,
        now: Date,
    ): Promise<AccountSubscription[]> {
        const { organizationId, contactId } = member;
        const [rows, online] = await Promise.all([
            prisma.customerSubscription.findMany({
                where: {
                    organizationId,
                    contactId,
                    status: { in: ["ACTIVE", "PAUSED"] },
                },
                orderBy: { createdAt: "desc" },
                take: PLAN_ROWS,
                select: {
                    id: true,
                    status: true,
                    price: true,
                    currency: true,
                    interval: true,
                    timezone: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                    pausedUntil: true,
                    ...ALLOWANCE_SELECT,
                    plan: { select: { name: true, classesPerMonth: true } },
                },
            }),
            takesPaymentOnline(prisma, organizationId),
        ]);
        return Promise.all(
            rows.map(async (row) => {
                const [month, overdue] = await Promise.all([
                    membershipMonth(organizationId, row, now),
                    online
                        ? overdueInvoiceOf(prisma, member, row.id, now)
                        : Promise.resolve(null),
                ]);
                const payNow =
                    overdue &&
                    !(await this.chargePending(organizationId, overdue.id))
                        ? overdue
                        : null;
                const [line, owed] = this.autopay
                    ? await Promise.all([
                          this.autopay.line(organizationId, row.id),
                          prisma.invoice.findFirst({
                              where: {
                                  organizationId,
                                  subscriptionId: row.id,
                                  status: "ISSUED",
                              },
                              orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
                              select: { total: true, currency: true },
                          }),
                      ])
                    : [null, null];
                return {
                    ...subscriptionView({
                        row,
                        classes: month,
                        payNow,
                        membersCanPause: pausing,
                    }),
                    autopay: line
                        ? {
                              state: line.state,
                              method: line.method,
                              hint: line.hint,
                              check: line.check,
                          }
                        : null,
                    autopayPays: owed
                        ? {
                              total: toMoneyString(owed.total),
                              currency: owed.currency,
                          }
                        : null,
                };
            }),
        );
    }

    /**
     * Packs not yet expired, with what is left. A used-up pack stays listed
     * ("Used up") until it expires, as the design shows it.
     */
    private async packs(
        member: CustomerScope,
        now: Date,
    ): Promise<AccountPack[]> {
        const rows = await prisma.packPurchase.findMany({
            where: {
                organizationId: member.organizationId,
                contactId: member.contactId,
                expiresAt: { gt: now },
            },
            orderBy: { expiresAt: "asc" },
            take: PACK_ROWS,
            select: {
                credits: true,
                expiresAt: true,
                pack: { select: { name: true } },
                _count: {
                    select: {
                        redemptions: { where: { reversedAt: null } },
                    },
                },
            },
        });
        return rows.map((p) =>
            accountPackView({
                credits: p.credits,
                used: p._count.redemptions,
                expiresAt: p.expiresAt,
                pack: p.pack,
            }),
        );
    }

    // ---- Changing --------------------------------------------------------

    /** Pause for 2, 4 or 8 weeks; 403 when the business has pausing off. */
    async pause(
        member: CustomerScope,
        id: string,
        weeks: PauseWeeks,
    ): Promise<AccountPlanChange> {
        if (!(await membersCanPause(member.organizationId))) {
            // Found first, so another person's plan stays a 404 either way.
            await this.own(member, id);
            throw new ForbiddenException({
                message: PAUSE_OFF,
                details: { reason: "pause-off" },
            });
        }
        const done = await this.subscriptions.pauseForCustomer(
            member,
            id,
            weeks,
        );
        return this.changed(
            member,
            planMessages.paused(done.pausedUntil, done.timezone),
        );
    }

    async resume(
        member: CustomerScope,
        id: string,
    ): Promise<AccountPlanChange> {
        const done = await this.subscriptions.resumeForCustomer(member, id);
        return this.changed(
            member,
            planMessages.resumed(done.restarted, done.renewsAt, done.timezone),
        );
    }

    /** At the period's end; one already set to end is a no-op, said so. */
    async cancel(
        member: CustomerScope,
        id: string,
    ): Promise<AccountPlanChange> {
        const done = await this.subscriptions.cancelForCustomer(member, id);
        return this.changed(
            member,
            planMessages.cancelled(done.outcome, done.endsAt, done.timezone),
        );
    }

    /**
     * "Pay now": a new pay link for the plan's oldest overdue invoice, made
     * now, so the member never sees an old one. The site sends them to it.
     */
    async payLink(member: CustomerScope, id: string): Promise<{ url: string }> {
        const { token } = await this.subscriptions.payLinkForCustomer(
            member,
            id,
            (invoiceId) => this.chargePending(member.organizationId, invoiceId),
        );
        return { url: payLinkUrl(token) };
    }

    private async changed(
        member: CustomerScope,
        message: string,
    ): Promise<AccountPlanChange> {
        return { message, tab: await this.tab(member) };
    }

    /** The member's own subscription, or a 404 as the service's lock says. */
    private async own(member: CustomerScope, id: string): Promise<void> {
        const found = await prisma.customerSubscription.findFirst({
            where: {
                id,
                organizationId: member.organizationId,
                contactId: member.contactId,
            },
            select: { id: true },
        });
        if (!found) throw new NotFoundException("Subscription not found");
    }
}
