import {
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import type { AutopayOutcome, AutopayStart } from "../payments/autopay.service";
import {
    AUTOPAY_NOT_OFFERED,
    AutopayService,
} from "../payments/autopay.service";
import type { MandateMethod } from "../payments/providers/provider.port";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { siteOriginOf } from "../sites/site-origin";
import { readPlanTerms } from "./plan-join";
import { paymentsOffered } from "./public-plans.service";

/** Autopay starts per account per ten minutes: retries, not a flood. */
const STARTS_PER_WINDOW = 10;
const START_WINDOW_MS = 10 * 60_000;

/** A plan joined with autopay from the Prices page: how it stands. */
export interface AccountJoinAutopay {
    /** paying: not paid yet. joined: on the plan. closed: never joined. */
    state: "paying" | "joined" | "closed";
    plan: string;
    /** Once joined: the plan's autopay and next payment. */
    outcome: AutopayOutcome | null;
}

/**
 * The customer's own autopay (round-2 D12; ADR-011). Every read and write
 * finds the plan by its ref **and** the signed-in customer's contact, never
 * by id and business alone: another customer's ref is a 404, and nothing is
 * set up. The page they come back to is on the business's own site, the one
 * they are signed in on.
 */
@Injectable()
export class AccountAutopayService {
    constructor(
        private readonly autopay: AutopayService,
        @Optional()
        private readonly startLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            STARTS_PER_WINDOW,
            START_WINDOW_MS,
        ),
    ) {}

    /**
     * "Set up autopay" or "Change how autopay pays" on My plan: with the
     * plan's unpaid invoice, paid in the same window for UPI and card, or
     * an authorisation alone when nothing is owed.
     */
    async start(
        customer: CustomerContext,
        ref: string,
        method: MandateMethod,
        idempotencyKey?: string,
    ): Promise<AutopayStart> {
        if (!this.startLimiter.take(customer.accountId)) {
            throw new HttpException(
                "Too many tries just now. Wait a few minutes, then try again.",
                429,
            );
        }
        const sub = await this.own(customer, ref);
        await assertOrganizationOpen(customer.organizationId);
        // Autopay is a way to pay: only while Payments is on (DEC-057).
        if (!(await paymentsOffered(customer.organizationId))) {
            throw new ConflictException({
                message: AUTOPAY_NOT_OFFERED,
                details: { reason: "not-offered" },
            });
        }
        const origin = await siteOriginOf(customer.organizationId, {
            siteId: customer.siteId,
        });
        return this.autopay.startForSubscription({
            organizationId: customer.organizationId,
            subscriptionId: sub.id,
            method,
            source: "ACCOUNT",
            accountId: customer.accountId,
            ...(idempotencyKey ? { idempotencyKey } : {}),
            returnUrl: origin
                ? `${origin}/autopay?plan=${encodeURIComponent(sub.id)}`
                : null,
        });
    }

    /** How their plan's autopay stands now, and whether anything is owed. */
    async outcome(
        customer: CustomerContext,
        ref: string,
    ): Promise<AutopayOutcome> {
        const sub = await this.own(customer, ref);
        const owed = await prisma.invoice.count({
            where: {
                organizationId: customer.organizationId,
                subscriptionId: sub.id,
                status: "ISSUED",
            },
        });
        return this.autopay.outcome(
            customer.organizationId,
            sub.id,
            owed === 0,
        );
    }

    /** A join of theirs (G20's draft ref), and its autopay once joined. */
    async join(
        customer: CustomerContext,
        ref: string,
    ): Promise<AccountJoinAutopay> {
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
        if (!row || !terms) {
            throw new NotFoundException("Plan payment not found");
        }
        if (row.status === "DRAFT") {
            return { state: "paying", plan: terms.name, outcome: null };
        }
        if (row.status === "PAID" && row.subscriptionId) {
            return {
                state: "joined",
                plan: terms.name,
                outcome: await this.autopay.outcome(
                    customer.organizationId,
                    row.subscriptionId,
                    true,
                ),
            };
        }
        return { state: "closed", plan: terms.name, outcome: null };
    }

    private async own(
        customer: CustomerContext,
        ref: string,
    ): Promise<{ id: string }> {
        const found = await prisma.customerSubscription.findFirst({
            where: {
                id: ref,
                organizationId: customer.organizationId,
                contactId: customer.contactId,
            },
            select: { id: true },
        });
        if (!found) throw new NotFoundException("Subscription not found");
        return found;
    }
}
