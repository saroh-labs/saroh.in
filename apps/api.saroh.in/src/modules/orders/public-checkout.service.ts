import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
    UnauthorizedException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import type { CreateIntentResult } from "../payments/payments.service";
import { PaymentsService } from "../payments/payments.service";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import {
    commerceOpen,
    effectiveStorefront,
    shopRolloutOn,
} from "../sites/sells-from";
import { soldOutRefundKey } from "../stock/reserve";
import {
    ORDER_CLOSED_REFUNDING,
    ORDER_CLOSED_WHILE_PAYING,
    SOLD_OUT_REFUNDING,
} from "../stock/stock-words";
import type { ShopScope } from "./checkout-bag";
import { priceBag, shopSettings } from "./checkout-bag";
import type { SiteAccount } from "./checkout-order";
import { createCheckoutOrder } from "./checkout-order";
import type { BagLine, CheckoutQuote, CheckoutWay } from "./checkout-quote";
import { feeCents } from "./checkout-quote";
import { checkoutReadiness } from "./checkout-readiness";
import type { CheckoutQuoteDto, CheckoutStartDto } from "./checkout.dto";
import {
    assertItemsAllow,
    FULFILMENT_RULES,
    shipsToAddress,
} from "./fulfilment";
import { fromCents } from "./order-pricing";

/**
 * The site's bag and checkout (round-2 G13), under
 * `public/sites/:siteId/checkout`.
 *
 * - **Derived, never accepted.** The Site is resolved first, and its
 *   business and sells-from storefront taken from it. Every read runs in
 *   that business's RLS context (`runInOrgContext`), and filters on it too.
 *   The shop's gates are G11's: the `SITE_SHOP` rollout flag, Commerce on,
 *   a storefront chosen. Any of them failing is a 404, as a site with no
 *   shop.
 * - **Priced by the server.** The bag carries listing and variant ids and
 *   quantities; prices, GST (DEC-023), the ways an order can leave and "can
 *   sell" are re-read here (`checkout-quote.ts`).
 * - **Offered only when it can be paid.** A storefront that is paused, or
 *   that no provider can take a payment for, has no checkout: the options
 *   say so, the site offers "Ask about ordering", and start refuses (403)
 *   even when called directly — nothing is created.
 * - **Start is signed in.** Behind `CustomerSessionGuard`: the signed relay
 *   and a live session for this very site. It makes the unpaid online order
 *   (`online-checkout.ts`) and its intent, and a retry with the same key
 *   returns the same pair.
 * - **Limited.** Options and quote per visitor address; start per address
 *   and per account (at most three checkouts open at once, business-wide;
 *   a new one at a storefront closes the account's older unpaid ones
 *   there, so changing the bag never piles them up).
 */

/** Options and quote reads per visitor per minute. */
const READS_PER_WINDOW = 60;
const READ_WINDOW_MS = 60_000;
/** Checkout starts per visitor address per ten minutes. */
const STARTS_PER_WINDOW = 10;
const START_WINDOW_MS = 10 * 60_000;
export { CHECKOUT_OPEN_ALREADY, MAX_OPEN_CHECKOUTS } from "./online-checkout";

/** What the site asks before it draws a bag. */
export interface CheckoutOptions {
    /** False: no bag; the product page offers "Ask about ordering". */
    canOrder: boolean;
    storefront: { name: string };
    currency: string;
    /** The ways the storefront offers, with their fees; empty when it can't. */
    ways: CheckoutWay[];
}

/** A started checkout: the order, and the provider's non-secret handoff. */
export interface CheckoutStarted {
    orderId: string;
    orderNumber: string;
    total: string;
    currency: string;
    payment: CreateIntentResult;
}

/**
 * How a started checkout stands, for the sheet waiting on the payment.
 * - paying: no answer from the provider yet.
 * - placed: paid, and its items held — a real order now.
 * - refunding: paid, but it sold out meanwhile or had closed; the refund
 *   is owed and not yet taken by the provider.
 * - refunded: the same, and the provider has taken the refund: the money
 *   is on its way back (DEC-026).
 * - closed: never paid, and closed.
 */
export interface CheckoutStanding {
    orderNumber: string;
    state: "paying" | "placed" | "refunding" | "refunded" | "closed";
    total: string;
    currency: string;
    /** For "refunding" and "refunded": what the customer is told (DEC-032). */
    message: string | null;
}

/** A refusal's words while its refund is still being sent (DEC-026). */
function refundingWords(reason: string | null): string {
    return reason === ORDER_CLOSED_WHILE_PAYING
        ? ORDER_CLOSED_REFUNDING
        : SOLD_OUT_REFUNDING;
}

/** Every miss looks the same: no shop, another business's order alike. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

function tooManyRequests(message = "Too many requests. Try again shortly.") {
    return new HttpException(message, 429);
}

@Injectable()
export class PublicCheckoutService {
    constructor(
        private readonly payments: PaymentsService,
        // Not DI providers — per-instance defaults that tests can replace.
        @Optional()
        private readonly readLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        @Optional()
        private readonly startLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            STARTS_PER_WINDOW,
            START_WINDOW_MS,
        ),
    ) {}

    /** Whether this site can take an online order now, and how it leaves. */
    async options(
        siteId: string,
        callerHash: string | undefined,
    ): Promise<CheckoutOptions> {
        this.read(siteId, callerHash);
        return this.inShop(siteId, async (scope) => {
            const settings = await shopSettings(scope);
            const ready = await checkoutReadiness(
                prisma,
                scope.organizationId,
                scope.storefront.id,
            );
            return {
                canOrder: ready.ok,
                storefront: { name: scope.storefront.name },
                currency: settings.currency,
                ways: ready.ok
                    ? settings.ways.map((type) => {
                          const fee = feeCents(type, settings.fees);
                          return {
                              type,
                              label: FULFILMENT_RULES[type].label,
                              fee: fee > 0 ? fromCents(fee) : null,
                          };
                      })
                    : [],
            };
        });
    }

    /** The bag priced now. Writes nothing and needs no session. */
    async quote(
        siteId: string,
        dto: CheckoutQuoteDto,
        callerHash: string | undefined,
    ): Promise<CheckoutQuote> {
        this.read(siteId, callerHash);
        return this.inShop(siteId, async (scope) => {
            const { quote } = await priceBag(
                scope,
                bagOf(dto.lines),
                dto.fulfilment ?? null,
            );
            return quote;
        });
    }

    /**
     * Start paying: the unpaid online order at the sells-from storefront,
     * and its intent. The customer is the session's; the relay's address is
     * what the start limit counts.
     */
    async start(
        siteId: string,
        customer: CustomerContext,
        clientHash: string,
        dto: CheckoutStartDto,
    ): Promise<CheckoutStarted> {
        if (customer.siteId !== siteId) throw signedOut();
        if (!this.startLimiter.take(clientHash)) throw tooManyRequests();
        return this.inShop(siteId, async (scope) => {
            if (scope.organizationId !== customer.organizationId) {
                throw signedOut();
            }
            await assertOrganizationOpen(scope.organizationId);
            const ready = await checkoutReadiness(
                prisma,
                scope.organizationId,
                scope.storefront.id,
            );
            if (!ready.ok) {
                throw new ForbiddenException({
                    message: "This shop isn't taking orders online right now.",
                    details: { reason: "cant-order" },
                });
            }
            const account = await this.account(customer);

            // The same key again: the same order, and the same intent.
            const existing = await prisma.order.findUnique({
                where: {
                    storeId_checkoutKey: {
                        storeId: scope.storefront.id,
                        checkoutKey: dto.key,
                    },
                },
                select: { id: true, customer: { select: { email: true } } },
            });
            if (existing) {
                if (!sameEmail(existing.customer.email, account.email)) {
                    throw new ConflictException(
                        "That checkout isn't yours. Start again.",
                    );
                }
                return this.pay(scope, account, existing.id, dto.key);
            }

            const { quote, lines, settings } = await priceBag(
                scope,
                bagOf(dto.lines),
                dto.fulfilment,
            );
            if (!quote.ready || quote.fulfilment !== dto.fulfilment) {
                throw new ConflictException({
                    message:
                        "Something in your bag has changed. Check it, then pay.",
                    details: { reason: "bag-changed" },
                });
            }
            const type = dto.fulfilment;
            // A product that lists how it may leave refuses any other (B12).
            assertItemsAllow(lines, type);
            if (shipsToAddress(type) && !dto.address) {
                throw new BadRequestException({
                    message: "Add the address to deliver to.",
                    field: "address",
                });
            }

            const orderId = await createCheckoutOrder(scope, account, {
                lines,
                type,
                shippingCents: feeCents(type, settings.fees),
                currency: settings.currency,
                dto,
            });
            return this.pay(scope, account, orderId, dto.key);
        });
    }

    /** How a checkout this customer started stands now. */
    async standing(
        siteId: string,
        customer: CustomerContext,
        orderId: string,
    ): Promise<CheckoutStanding> {
        if (customer.siteId !== siteId) throw signedOut();
        this.read(siteId, customer.accountId);
        return runInOrgContext(customer.organizationId, async () => {
            const account = await this.account(customer);
            const order = await prisma.order.findFirst({
                where: {
                    id: orderId,
                    organizationId: customer.organizationId,
                    placedOnline: true,
                },
                select: {
                    orderId: true,
                    total: true,
                    currency: true,
                    status: true,
                    paymentStatus: true,
                    customer: { select: { email: true } },
                    paymentIntents: {
                        select: {
                            id: true,
                            refunds: {
                                select: {
                                    idempotencyKey: true,
                                    reason: true,
                                    status: true,
                                    providerRefundId: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!order || !sameEmail(order.customer.email, account.email)) {
                notFound();
            }
            const refusals = order.paymentIntents.flatMap((i) =>
                i.refunds.filter(
                    (r) => r.idempotencyKey === soldOutRefundKey(i.id),
                ),
            );
            const refused = refusals.length > 0 ? refusals[0] : null;
            // "On its way back" only once the provider has taken the refund
            // (DEC-026); until then — sending, retried, or refused and left
            // to staff — it is owed, and said so.
            const taken =
                refused !== null &&
                (refused.status === "SUCCEEDED" ||
                    (refused.status === "PENDING" &&
                        refused.providerRefundId !== null));
            const state: CheckoutStanding["state"] =
                order.paymentStatus === "PAID" ||
                order.paymentStatus === "REFUNDED"
                    ? "placed"
                    : refused
                      ? taken
                          ? "refunded"
                          : "refunding"
                      : order.status === "CANCELLED"
                        ? "closed"
                        : "paying";
            return {
                orderNumber: order.orderId,
                state,
                total: toMoneyString(order.total),
                currency: order.currency,
                message:
                    state === "refunded"
                        ? (refused?.reason ?? null)
                        : state === "refunding"
                          ? refundingWords(refused?.reason ?? null)
                          : null,
            };
        });
    }

    // -----------------------------------------------------------------------

    private read(siteId: string, callerHash: string | undefined): void {
        // A caller the platform gives no address for shares one bucket per
        // site, as the shop's other reads do.
        if (!this.readLimiter.take(callerHash ?? `site:${siteId}`)) {
            throw tooManyRequests();
        }
    }

    /** The site, its business and every gate, then `fn` in its context. */
    private async inShop<T>(
        siteId: string,
        fn: (scope: ShopScope) => Promise<T>,
    ): Promise<T> {
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true, storefrontId: true },
        });
        if (!site) notFound();
        const { organizationId } = site;
        if (!(await shopRolloutOn(organizationId))) notFound();
        // Public checkout is never module-gated off mid-payment: a payment
        // already started still lands through the webhook. Only new starts
        // ask whether Commerce is on.
        return runInOrgContext(organizationId, async () => {
            if (!(await commerceOpen(prisma, organizationId))) notFound();
            const storefront = await effectiveStorefront(prisma, site);
            if (!storefront) notFound();
            return fn({ organizationId, storefront });
        });
    }

    /** The signed-in account's email and the contact it stands for. */
    private async account(customer: CustomerContext): Promise<SiteAccount> {
        const row = await prisma.customerAccount.findFirst({
            where: {
                id: customer.accountId,
                organizationId: customer.organizationId,
                status: "ACTIVE",
            },
            select: {
                email: true,
                contactId: true,
                contact: { select: { firstName: true, lastName: true } },
            },
        });
        if (!row) throw signedOut();
        return {
            email: row.email,
            contactId: row.contactId,
            firstName: row.contact.firstName,
            lastName: row.contact.lastName,
        };
    }

    /** The order's intent, made or replayed under the checkout's key. */
    private async pay(
        scope: ShopScope,
        account: SiteAccount,
        orderId: string,
        key: string,
    ): Promise<CheckoutStarted> {
        // Matched as the checkout matched it: whatever case staff typed.
        const customers = await prisma.customer.findMany({
            where: {
                storeId: scope.storefront.id,
                email: { equals: account.email, mode: "insensitive" },
            },
            select: { id: true },
        });
        const payment = await this.payments.createIntentForOnlineOrder(
            {
                organizationId: scope.organizationId,
                customerIds: customers.map((c) => c.id),
            },
            orderId,
            `checkout:${key}`,
        );
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            select: { orderId: true, total: true, currency: true },
        });
        return {
            orderId,
            orderNumber: order.orderId,
            total: toMoneyString(order.total),
            currency: order.currency,
            payment,
        };
    }
}

function bagOf(
    lines: readonly {
        listingId: string;
        variantId?: string | null;
        quantity: number;
    }[],
): BagLine[] {
    return lines.map((l) => ({
        listingId: l.listingId,
        variantId: l.variantId ?? null,
        quantity: l.quantity,
    }));
}

function sameEmail(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function signedOut(): UnauthorizedException {
    return new UnauthorizedException({
        message: "Sign in to continue.",
        details: { reason: "signed-out" },
    });
}
