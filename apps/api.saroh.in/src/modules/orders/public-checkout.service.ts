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

import { toMinor, toMoneyString } from "../../common/money";
import { notTakingOrders } from "../billing/paused-errors";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { DiscountsService } from "../discounts/discounts.service";
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
import type { PickupPlace } from "../stores/pickup-place";
import type { BagCode, ShopScope } from "./checkout-bag";
import { priceBag, shopSettings } from "./checkout-bag";
import type { SiteAccount } from "./checkout-order";
import { createCheckoutOrder } from "./checkout-order";
import { shopPause } from "./checkout-paused";
import type { BagLine, CheckoutQuote, CheckoutWay } from "./checkout-quote";
import { feeCents } from "./checkout-quote";
import type {
    CheckoutPayment,
    CheckoutPayOption,
    CheckoutReadiness,
} from "./checkout-readiness";
import {
    checkoutReadiness,
    payableWays,
    payOptionsFor,
} from "./checkout-readiness";
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
 * - **Offered only when it can be paid.** Online needs a plan with online
 *   payments and a provider; paying on handover ("Pay when you collect",
 *   "Pay on delivery") is always open on a plan without them, and on a plan
 *   with them only when the storefront turns it on (`checkout-readiness.ts`).
 *   A storefront that is paused, or that neither way can pay for, has no
 *   checkout: the options say so, the site offers "Ask about ordering", and
 *   start refuses (403) even when called directly — nothing is created.
 * - **Start is signed in.** Behind `CustomerSessionGuard`: the signed relay
 *   and a live session for this very site. Paid online, it makes the unpaid
 *   online order (`online-checkout.ts`) and its intent; paid on handover,
 *   the order, holding its units, and nothing to pay now. A retry with the
 *   same key returns the same order.
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
    /** How it can be paid: online, on handover, both, or neither (can't). */
    payments: { online: boolean; onHandover: boolean };
    /**
     * Where a pick-up is collected (UX-025): the storefront's address and
     * hours, the business's public details. Null when Pick-up isn't offered.
     */
    pickup: PickupPlace | null;
    /**
     * True when a move to a lower plan stopped this website or its location
     * taking orders (#800): the site says "This business isn't taking
     * orders right now." and draws no bag. Absent from an older API.
     */
    notTakingOrders?: boolean;
}

/** The bag priced now, and how an order leaving the chosen way is paid. */
export interface PricedBag extends CheckoutQuote {
    /** Empty until a way is chosen, or when the shop can't take orders. */
    payments: CheckoutPayOption[];
    /** Where a pick-up is collected (UX-025); null when Pick-up isn't offered. */
    pickup: PickupPlace | null;
}

/**
 * A started checkout: the order, and the provider's non-secret handoff —
 * or, paid on handover, no handoff: the order is placed already.
 */
export interface CheckoutStarted {
    orderId: string;
    orderNumber: string;
    total: string;
    currency: string;
    payBy: CheckoutPayment;
    payment: CreateIntentResult | null;
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
 * - to-pay: placed to be paid on handover, and not paid yet.
 */
export interface CheckoutStanding {
    orderNumber: string;
    state: "paying" | "placed" | "refunding" | "refunded" | "closed" | "to-pay";
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
        // The counter's discount evaluation (DEC-104); stateless, so a test
        // that builds this service by hand gets the real one.
        @Optional()
        private readonly discounts: DiscountsService = new DiscountsService(),
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
            const pays = paysOf(ready);
            const ways = ready.ok
                ? payableWays(pays, settings.ways).map((type) => {
                      const fee = feeCents(type, settings.fees);
                      return {
                          type,
                          label: FULFILMENT_RULES[type].label,
                          fee: fee > 0 ? fromCents(fee) : null,
                      };
                  })
                : [];
            if (scope.takingOrders === false) {
                return {
                    canOrder: false,
                    notTakingOrders: true,
                    storefront: { name: scope.storefront.name },
                    currency: settings.currency,
                    ways: [],
                    payments: { online: false, onHandover: false },
                    pickup: null,
                };
            }
            return {
                // No way an order can leave (Pick-up from a place with no
                // address, UX-025): the product page asks about ordering
                // rather than filling a bag that can't be checked out.
                canOrder: ready.ok && ways.length > 0,
                storefront: { name: scope.storefront.name },
                currency: settings.currency,
                ways,
                payments: pays,
                pickup: ways.some((w) => w.type === "PICKUP")
                    ? settings.pickup
                    : null,
            };
        });
    }

    /** The bag priced now. Writes nothing and needs no session. */
    async quote(
        siteId: string,
        dto: CheckoutQuoteDto,
        callerHash: string | undefined,
    ): Promise<PricedBag> {
        this.read(siteId, callerHash);
        return this.inShop(siteId, async (scope) => {
            if (scope.takingOrders === false) throw notTakingOrders();
            const pays = paysOf(
                await checkoutReadiness(
                    prisma,
                    scope.organizationId,
                    scope.storefront.id,
                ),
            );
            // A shop that can't take orders still prices its bag as it
            // always has (a test release's bag, DEC-071); only the ways
            // to pay are empty.
            const canPay = pays.online || pays.onHandover;
            const { quote, settings } = await priceBag(
                scope,
                bagOf(dto.lines),
                dto.fulfilment ?? null,
                canPay ? pays : undefined,
                this.codeOf(scope, dto.discountCode),
            );
            return {
                ...quote,
                pickup: quote.ways.some((w) => w.type === "PICKUP")
                    ? settings.pickup
                    : null,
                payments: quote.fulfilment
                    ? payOptionsFor(pays, quote.fulfilment)
                    : [],
            };
        });
    }

    /**
     * Start paying: the unpaid online order at the sells-from storefront,
     * and its intent — or, paid on handover, the order holding its units,
     * with nothing to pay now. The customer is the session's; the relay's
     * address is what the start limit counts.
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
            if (scope.takingOrders === false) throw notTakingOrders();
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
                select: {
                    id: true,
                    payOnHandover: true,
                    customer: { select: { email: true } },
                },
            });
            if (existing) {
                if (
                    !existing.customer ||
                    !sameEmail(existing.customer.email, account.email)
                ) {
                    throw new ConflictException(
                        "That checkout isn't yours. Start again.",
                    );
                }
                return existing.payOnHandover
                    ? this.placed(existing.id)
                    : this.pay(scope, account, existing.id, dto.key);
            }

            const payBy: CheckoutPayment = dto.payment ?? "ONLINE";
            const { quote, lines, settings, applied } = await priceBag(
                scope,
                bagOf(dto.lines),
                dto.fulfilment,
                ready,
                this.codeOf(scope, dto.discountCode),
            );
            if (!quote.ready || quote.fulfilment !== dto.fulfilment) {
                throw new ConflictException({
                    message:
                        "Something in your bag has changed. Check it, then pay.",
                    details: { reason: "bag-changed" },
                });
            }
            const type = dto.fulfilment;
            // A way to pay the shop offers for this way to leave: one turned
            // off since the bag was priced is a changed bag, priced again.
            if (!payOptionsFor(ready, type).some((o) => o.type === payBy)) {
                throw new ConflictException({
                    message:
                        "How you can pay has changed. Check your bag, then place your order.",
                    details: { reason: "bag-changed" },
                });
            }
            // A code that no longer applies (it ended, or its last use went
            // at the counter meanwhile) is a changed bag: priced again, the
            // bag says why — never a full-price order the customer didn't
            // agree to.
            if (dto.discountCode && !applied) {
                throw new ConflictException({
                    message:
                        quote.discount && !quote.discount.applied
                            ? quote.discount.message
                            : "Your code no longer applies. Check your bag, then place your order.",
                    details: { reason: "bag-changed", field: "discountCode" },
                });
            }
            // Nothing left to pay online: a provider can't take a payment
            // of nothing, so the order is placed to be settled at the handover.
            if (payBy === "ONLINE" && applied && Number(quote.total) <= 0) {
                throw new ConflictException({
                    message:
                        "Your code covers the whole order, so there's nothing to pay online. Choose to pay when it reaches you.",
                    details: { reason: "bag-changed", field: "discountCode" },
                });
            }
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
                // The delivery the bag showed for this way: free at or
                // above the storefront's "Free delivery over" (`deliveryCents`).
                shippingCents: toMinor(quote.delivery),
                currency: settings.currency,
                dto,
                payOnHandover: payBy === "ON_HANDOVER",
                discount: applied,
            });
            return payBy === "ON_HANDOVER"
                ? this.placed(orderId)
                : this.pay(scope, account, orderId, dto.key);
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
                    payOnHandover: true,
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
            if (
                !order?.customer ||
                !sameEmail(order.customer.email, account.email)
            ) {
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
                        : order.payOnHandover
                          ? "to-pay"
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

    /** A typed code, bound to the counter's evaluation for this business. */
    private codeOf(
        scope: ShopScope,
        code: string | null | undefined,
    ): BagCode | null {
        if (!code) return null;
        return {
            code,
            check: (order) =>
                this.discounts.checkForOrder(scope.organizationId, code, order),
        };
    }

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
            // A move to a lower plan (#800): a paused website or location
            // takes no orders, and a paused product isn't sold here.
            const pause = await shopPause(
                organizationId,
                siteId,
                storefront.id,
            );
            return fn({ organizationId, storefront, ...pause });
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
            accountId: customer.accountId,
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
            payBy: "ONLINE",
            payment,
        };
    }

    /** An order placed to be paid on handover: nothing to pay now. */
    private async placed(orderId: string): Promise<CheckoutStarted> {
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            select: { orderId: true, total: true, currency: true },
        });
        return {
            orderId,
            orderNumber: order.orderId,
            total: toMoneyString(order.total),
            currency: order.currency,
            payBy: "ON_HANDOVER",
            payment: null,
        };
    }
}

/** How a storefront can be paid; neither when it can't take orders. */
function paysOf(ready: CheckoutReadiness): {
    online: boolean;
    onHandover: boolean;
} {
    return ready.ok
        ? { online: ready.online, onHandover: ready.onHandover }
        : { online: false, onHandover: false };
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
