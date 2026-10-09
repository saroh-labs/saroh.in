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
import { siteTakingOrders, withPause } from "../orders/checkout-paused";
import { PACKS_ON_SALE } from "./pack-on-sale";
import { packsOffered } from "./packs-offered";

/**
 * The class packs a merchant's site lists (round-2 G20): what the Prices
 * page's Class packs section reads at `GET public/sites/:siteId/packs`.
 *
 * - **Derived, never accepted.** The Site is resolved first and its
 *   organization taken from it; the caller names only the site. The read
 *   runs in that organization's RLS context and filters on it too.
 * - **Only what is on sale, as published.** Packs filtered by
 *   {@link PACKS_ON_SALE} (never a DRAFT, never ARCHIVED), and only their
 *   published columns and services: a live pack's unpublished changes
 *   (`pendingChanges`) are never selected (E14).
 * - **Nothing while Class packs is off.** Rolled out for the business AND
 *   switched on, as the account's Buy a pack asks (`packsOffered`, A11).
 *   Otherwise a 404, the same as a site with no packs, so a rollout flag
 *   never leaks (DEC-057).
 * - **Whether Buy works**: `payOnline`, the booking page's own question (a
 *   connected provider that opens a checkout). False: the site offers "Ask
 *   about this pack". It never says how to pay (DEC-059).
 * - **An explicit allow-list.** Name, description, classes, validity,
 *   price, and one class's price to compare it with — no counts, no ids of
 *   anything else.
 * - **Limited per visitor**, keyed as the other public reads are.
 */

/** Reads per visitor per minute: a page view is one. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** The most a site lists; a small business's packs are well under it. */
const MAX_PACKS = 30;

/** One pack as a site shows it. */
export interface PublicPack {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    /** A decimal string, e.g. "4500.00". */
    price: string;
    currency: string;
    /** CLASSES pays for classes, ONE_TO_ONE for one-to-one sessions (E13). */
    kind: "CLASSES" | "ONE_TO_ONE";
    /**
     * One visit's price to compare the pack with: the cheapest priced
     * service it covers, in the pack's currency, as a decimal string. Null
     * when none has a price.
     */
    singlePrice: string | null;
}

export interface PublicPacks {
    packs: PublicPack[];
    /** Whether a signed-in customer can buy online now. */
    payOnline: boolean;
    /**
     * True on a website a move to a lower plan paused (#800): nothing is
     * sold here online. Absent otherwise.
     */
    notTakingOrders?: true;
}

function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

/** A covered service as the read selects it. */
interface CoveredService {
    service: {
        priceCents: number | null;
        currency: string | null;
        status: string;
        deletedAt: Date | null;
    };
}

/**
 * The cheapest live, priced service a pack covers, in its currency, as a
 * decimal string; null when none. Pure, so the rule is testable without a
 * database.
 */
export function singlePriceOf(
    currency: string,
    services: readonly CoveredService[],
): string | null {
    let cheapest: number | null = null;
    for (const { service } of services) {
        if (service.status !== "ACTIVE" || service.deletedAt !== null) {
            continue;
        }
        if (service.priceCents === null || service.priceCents <= 0) continue;
        if (service.currency !== currency) continue;
        if (cheapest === null || service.priceCents < cheapest) {
            cheapest = service.priceCents;
        }
    }
    return cheapest === null ? null : (cheapest / 100).toFixed(2);
}

/** A pack row as the read selects it, shaped for the site. Pure. */
export function publicPackView(row: {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    price: { toString(): string };
    currency: string;
    kind: string;
    services: readonly CoveredService[];
}): PublicPack {
    const description = row.description?.trim() ?? "";
    return {
        id: row.id,
        name: row.name,
        description: description.length > 0 ? description : null,
        credits: row.credits,
        validityDays: row.validityDays,
        price: toMoneyString(row.price),
        currency: row.currency,
        kind: row.kind === "ONE_TO_ONE" ? "ONE_TO_ONE" : "CLASSES",
        singlePrice: singlePriceOf(row.currency, row.services),
    };
}

@Injectable()
export class PublicPacksService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    async list(
        siteId: string,
        callerHash: string | undefined,
    ): Promise<PublicPacks> {
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

        const [rows, payOnline, taking] = await runInOrgContext(
            organizationId,
            async () => {
                if (!(await packsOffered(organizationId))) notFound();
                return Promise.all([
                    prisma.classPack.findMany({
                        where: { organizationId, ...PACKS_ON_SALE },
                        take: MAX_PACKS,
                        orderBy: [
                            { price: "asc" },
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                        // The published columns only: never `pendingChanges`.
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            credits: true,
                            validityDays: true,
                            price: true,
                            currency: true,
                            kind: true,
                            services: {
                                select: {
                                    service: {
                                        select: {
                                            priceCents: true,
                                            currency: true,
                                            status: true,
                                            deletedAt: true,
                                        },
                                    },
                                },
                            },
                        },
                    }),
                    takesOnlinePayment(organizationId),
                    // A website a lower plan paused sells nothing (#800).
                    siteTakingOrders(organizationId, siteId),
                ]);
            },
        );
        return withPause(
            { payOnline, packs: rows.map(publicPackView) },
            taking,
        );
    }
}
