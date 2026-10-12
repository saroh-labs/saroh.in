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
import { serviceCharge } from "../bookings/service-price";
import type { GstOnPrice, PriceTerms } from "../invoices/gst-price";
import { NO_GST_TERMS } from "../invoices/gst-price";
import type { RatedSale } from "../invoices/sale-price";
import {
    priceTermsFor,
    RATED_SALE_SELECT,
    saleCharge,
} from "../invoices/sale-price";
import { toCents } from "../invoices/totals";
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
    /**
     * The two sides of "₹531 a class instead of ₹708", both as amounts to
     * pay, GST and all, so like is compared with like (12 Oct 2026):
     * `payEach` is the pack's amount to pay for one visit, to the whole
     * currency unit ("531.00"); `singlePay` the least a covered service
     * costs to pay alone ("708.00"), or null when none has a price. Where
     * GST is in the prices, or none is charged, they are the typed
     * figures the site worked out before. `payEach` is null for a pack
     * with no visits to divide by.
     */
    payEach: string | null;
    singlePay: string | null;
    /**
     * The GST on the price, as the customer is told it before buying (12
     * Oct 2026): the typed price, the GST in or on it and the amount to
     * pay. Null when nothing is said about GST: the price is what is paid.
     * Added beside the rest, so an older site shows the price as before.
     */
    gst: GstOnPrice | null;
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
        /** Its GST, for what it costs to pay alone; absent reads as none. */
        gstRate?: { toString(): string } | null;
        gstPriceMode?: string | null;
    };
}

/**
 * The least of the live, priced services a pack covers, in its currency,
 * as a decimal string; null when none. `cents` says which figure of a
 * service is compared. Pure, so the rule is testable without a database.
 */
function cheapestOf(
    currency: string,
    services: readonly CoveredService[],
    cents: (service: CoveredService["service"]) => number | null,
): string | null {
    let cheapest: number | null = null;
    for (const { service } of services) {
        if (service.status !== "ACTIVE" || service.deletedAt !== null) {
            continue;
        }
        if (service.priceCents === null || service.priceCents <= 0) continue;
        if (service.currency !== currency) continue;
        const amount = cents(service);
        if (amount === null) continue;
        if (cheapest === null || amount < cheapest) cheapest = amount;
    }
    return cheapest === null ? null : (cheapest / 100).toFixed(2);
}

/** The cheapest covered service by its typed price ({@link cheapestOf}). */
export function singlePriceOf(
    currency: string,
    services: readonly CoveredService[],
): string | null {
    return cheapestOf(currency, services, (s) => s.priceCents);
}

/**
 * The least a covered service costs to pay alone, GST and all: each by its
 * own rate and its own way of carrying GST (`serviceCharge`).
 */
export function singlePayOf(
    currency: string,
    services: readonly CoveredService[],
    terms: PriceTerms = NO_GST_TERMS,
): string | null {
    return cheapestOf(
        currency,
        services,
        (s) =>
            serviceCharge(
                {
                    priceCents: s.priceCents,
                    gstRate: s.gstRate ?? null,
                    gstPriceMode: s.gstPriceMode,
                },
                terms,
            ).payCents,
    );
}

/**
 * One visit's share of a pack's amount to pay, to the whole currency unit
 * (half up), as the card has always said it: ₹5,310 for 10 is "531.00".
 */
export function payEachOf(payCents: number, credits: number): string | null {
    if (credits <= 0) return null;
    return `${Math.round(payCents / credits / 100)}.00`;
}

/**
 * A pack row as the read selects it, shaped for the site. Pure. `terms` is
 * the business's GST standing; without it nothing is said about GST.
 */
export function publicPackView(
    row: {
        id: string;
        name: string;
        description: string | null;
        credits: number;
        validityDays: number;
        price: { toString(): string };
        currency: string;
        kind: string;
        services: readonly CoveredService[];
    } & RatedSale,
    terms: PriceTerms = NO_GST_TERMS,
): PublicPack {
    const description = row.description?.trim() ?? "";
    const charge = saleCharge(toCents(toMoneyString(row.price)), row, terms);
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
        payEach: payEachOf(charge.payCents, row.credits),
        singlePay: singlePayOf(row.currency, row.services, terms),
        gst: charge.gst,
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

        const [rows, payOnline, taking, terms] = await runInOrgContext(
            organizationId,
            async () => {
                if (!(await packsOffered(organizationId))) notFound();
                const [packs, takes, takingOrders] = await Promise.all([
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
                            ...RATED_SALE_SELECT,
                            services: {
                                select: {
                                    service: {
                                        select: {
                                            priceCents: true,
                                            currency: true,
                                            status: true,
                                            deletedAt: true,
                                            gstRate: true,
                                            gstPriceMode: true,
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
                return [
                    packs,
                    takes,
                    takingOrders,
                    // How the business's prices carry GST; read only when
                    // a pack, or a service one covers, has a rate.
                    await priceTermsFor(prisma, organizationId, [
                        ...packs,
                        ...packs.flatMap((p) =>
                            p.services.map((s) => s.service),
                        ),
                    ]),
                ] as const;
            },
        );
        return withPause(
            { payOnline, packs: rows.map((r) => publicPackView(r, terms)) },
            taking,
        );
    }
}
