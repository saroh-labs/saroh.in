import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { takesOnlinePayment } from "../bookings/public-booking-page";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { MODULE_BY_KEY } from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { AutopayService } from "../payments/autopay.service";
import type { MandateMethod } from "../payments/providers/provider.port";
import { PLANS_ON_SALE } from "./plan-on-sale";

/**
 * The plans a merchant's site lists (round-2 G9): what the Plans block reads
 * at `GET public/sites/:siteId/plans`.
 *
 * - **Derived, never accepted.** The Site is resolved first and its
 *   organization taken from it; the caller names only the site. The read
 *   runs in that organization's RLS context and filters on it too.
 * - **Only what is on sale, as published.** Plans filtered by
 *   {@link PLANS_ON_SALE} (never a DRAFT, never ARCHIVED), and only their
 *   published columns: a live plan's unpublished changes (`pendingChanges`)
 *   are never selected, so a buyer keeps reading the published values until
 *   the merchant publishes (D5).
 * - **Nothing while Payments is off.** Plans live under Payments, so the
 *   read asks what the customer's account area asks (`account-home`): the
 *   module rolled out for the business AND switched on. Otherwise a 404, the
 *   same as a site with no plans at all, so a rollout flag never leaks
 *   (DEC-057).
 * - **Whether Join works** (G20): `payOnline`, the booking page's own
 *   question (a connected provider that opens a checkout). It never says
 *   how — the site names no payment method (DEC-059).
 * - **An explicit allow-list.** Name, description, price, currency and how
 *   often — no counts, no ids of anything else. Nothing about how to pay:
 *   the site names no payment method (DEC-059).
 * - **Limited per visitor**, keyed as the other public reads are.
 */

/** Reads per visitor per minute: a page view is one. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** The most a site lists; a small business's plans are well under it. */
const MAX_PLANS = 50;

/** One plan as a site shows it. */
export interface PublicPlan {
    id: string;
    name: string;
    description: string | null;
    /** A decimal string, e.g. "1200.00". */
    price: string;
    currency: string;
    /** WEEK | MONTH | QUARTER | YEAR */
    interval: string;
    /**
     * True on the one plan more current members are on than any other, so a
     * site's "Most chosen" is a fact, not a guess. At most one plan has it.
     */
    mostChosen: boolean;
}

export interface PublicPlans {
    plans: PublicPlan[];
    /**
     * Whether a signed-in customer can join online now (G20): Payments on
     * and a provider that opens a checkout. False: the site offers "Ask
     * about joining" instead. Added beside `plans`, so an older site that
     * never reads it keeps working.
     */
    payOnline: boolean;
    /**
     * Every way the business's provider can take autopay (D12), for the
     * join sheet's "Pay with"; empty when it takes none, or Join isn't
     * paid online. Added beside the rest, so an older site ignores it.
     */
    autopayMethods: MandateMethod[];
}

function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

// Stateless (it reads the flag rows on every call).
const flags = new FeatureFlagService();

/**
 * Whether Payments is on for the business, as the customer's account area
 * decides it: rolled out AND switched on.
 */
export async function paymentsOffered(
    organizationId: string,
): Promise<boolean> {
    const descriptor = MODULE_BY_KEY.get("PAYMENTS");
    if (!descriptor) return false;
    const [rolledOut, installed] = await Promise.all([
        flags.isEnabled(descriptor.rolloutFlag, organizationId),
        prisma.organizationModule.findFirst({
            where: { organizationId, moduleKey: "PAYMENTS", status: "ENABLED" },
            select: { id: true },
        }),
    ]);
    return rolledOut && installed !== null;
}

/**
 * Order the plans most-chosen first, then by price, then by name, and mark
 * the leader. Pure, so the rule is testable without a database.
 */
export function orderPlans(
    rows: readonly {
        id: string;
        name: string;
        description: string | null;
        price: { toString(): string };
        currency: string;
        interval: string;
        members: number;
    }[],
): PublicPlan[] {
    const sorted = [...rows].sort(
        (a, b) =>
            b.members - a.members ||
            Number(a.price.toString()) - Number(b.price.toString()) ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
    );
    // Two or more plans: the leader has strictly more members than the next.
    // One plan: it leads if anyone is on it.
    const top = sorted.length > 0 ? sorted[0].members : 0;
    const next = sorted.length > 1 ? sorted[1].members : 0;
    const leader = top > 0 && top > next ? sorted[0].id : null;
    return sorted.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description?.trim() ? row.description : null,
        price: toMoneyString(row.price),
        currency: row.currency,
        interval: row.interval,
        mostChosen: row.id === leader,
    }));
}

@Injectable()
export class PublicPlansService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        // Autopay's methods (D12); absent where a test builds this by hand.
        @Optional() private readonly autopay?: AutopayService,
    ) {}

    async list(
        siteId: string,
        callerHash: string | undefined,
    ): Promise<PublicPlans> {
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!site) notFound();
        const { organizationId } = site;

        const [rows, payOnline] = await runInOrgContext(
            organizationId,
            async () => {
                if (!(await paymentsOffered(organizationId))) notFound();
                return Promise.all([
                    prisma.subscriptionPlan.findMany({
                        where: { organizationId, ...PLANS_ON_SALE },
                        take: MAX_PLANS,
                        orderBy: [
                            { price: "asc" },
                            { name: "asc" },
                            { id: "asc" },
                        ],
                        // The published columns only: never `pendingChanges`.
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            price: true,
                            currency: true,
                            interval: true,
                            _count: {
                                select: {
                                    subscriptions: {
                                        where: { status: { not: "CANCELLED" } },
                                    },
                                },
                            },
                        },
                    }),
                    takesOnlinePayment(organizationId),
                ]);
            },
        );
        // How the join sheet can offer autopay (D12): the provider's own
        // list, only where Join is paid online; a provider that can't say
        // offers none.
        const autopay = this.autopay;
        const autopayMethods =
            payOnline && autopay
                ? await runInOrgContext(organizationId, () =>
                      autopay
                          .offer(organizationId)
                          .catch((): MandateMethod[] => []),
                  )
                : [];
        return {
            payOnline,
            autopayMethods,
            plans: orderPlans(
                rows.map(({ _count, ...row }) => ({
                    ...row,
                    members: _count.subscriptions,
                })),
            ),
        };
    }
}
