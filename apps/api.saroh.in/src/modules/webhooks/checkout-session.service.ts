import { timingSafeEqual } from "node:crypto";

import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { releaseHoldInTx } from "../bookings/booking-hold";
import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import { OPEN_INTENT_STATUSES } from "../payments/intent-state";
import { PaymentsService } from "../payments/payments.service";
import { openProviderCredentials } from "../payments/provider-credentials";
import type { ProviderFactory } from "../payments/providers/provider.port";
import { PROVIDER_FACTORY } from "../payments/providers/provider.port";
import type { CheckoutKind } from "../payments/stripe-checkout";
import { hashCancelToken, safeReturnPath } from "../payments/stripe-checkout";
import { PaymentLookupService } from "./payment-lookup.service";

/**
 * Where a Stripe hosted Checkout payment stands, as the return page says
 * it: still open, a slow method under way, paid, failed, closed (cancelled
 * or expired), or paid but not kept (a hold whose place had gone, or a
 * booking cancelled meanwhile), so the money goes back.
 */
export type CheckoutSessionStatus =
    "open" | "processing" | "paid" | "failed" | "closed" | "refunding";

/**
 * The buyer's view of one Checkout payment (plan 2026-11-07-002, U7).
 * Named fields only: never the customer's details, Stripe's ids, or any
 * Saroh id beyond what the URL already holds.
 */
export interface CheckoutSessionView {
    status: CheckoutSessionStatus;
    kind: CheckoutKind;
    businessName: string;
    amountCents: number;
    currency: string;
    /** A booking hold's time, as the booker saw it. Null for anything else. */
    booking: {
        serviceName: string;
        startAt: string;
        endAt: string;
        timezone: string;
    } | null;
    /**
     * The same-site path the customer started from, as it was checked and
     * stored when the session was made; null to use the kind's default.
     */
    returnPath: string | null;
}

/** Asked about Stripe at most this often per session, polls or not. */
const LOOKUP_EVERY_MS = 10_000;

const INTENT_SELECT = {
    id: true,
    organizationId: true,
    provider: true,
    providerCheckoutId: true,
    providerIntentId: true,
    status: true,
    amountCents: true,
    currency: true,
    orderId: true,
    invoiceId: true,
    lastLookupAt: true,
    organization: { select: { name: true } },
    invoice: {
        select: {
            status: true,
            source: true,
            bookingId: true,
            booking: {
                select: {
                    startAt: true,
                    endAt: true,
                    timezone: true,
                    snapshot: true,
                },
            },
        },
    },
    attempts: {
        orderBy: { createdAt: "asc" },
        select: { status: true, rawResponse: true },
    },
} as const;

type IntentRead = NonNullable<
    Awaited<
        ReturnType<
            typeof prisma.paymentIntent.findFirst<{
                select: typeof INTENT_SELECT;
            }>
        >
    >
>;

/** What the first attempt keeps beside `clientParams` (`StoredCheckout`). */
interface Stored {
    checkoutKind?: CheckoutKind;
    returnPath?: string | null;
    cancelTokenHash?: string;
    expiresAt?: string;
}

/**
 * The return page's two reads of a Stripe hosted Checkout, both public and
 * keyed by what Stripe's redirect carried: the session id on success, and
 * Saroh's intent id with its cancel token on cancel. The business is the
 * intent's, never one the caller names; an unknown id and a wrong token
 * are the same 404.
 */
@Injectable()
export class CheckoutSessionService {
    private readonly logger = new Logger(CheckoutSessionService.name);

    constructor(
        private readonly lookup: PaymentLookupService,
        private readonly payments: PaymentsService,
        @Inject(PROVIDER_FACTORY) private readonly providers: ProviderFactory,
    ) {}

    /**
     * The session's payment as it stands. Still open, Stripe is asked once
     * (P1) — at most every {@link LOOKUP_EVERY_MS} — so a slow webhook
     * doesn't hold the page; a look-up that fails leaves it open.
     */
    async read(sessionId: string): Promise<CheckoutSessionView> {
        const where = { provider: "STRIPE", providerCheckoutId: sessionId };
        let intent = await prisma.paymentIntent.findFirst({
            where,
            select: INTENT_SELECT,
        });
        if (!intent) throw notFound();
        const due =
            !intent.lastLookupAt ||
            Date.now() - intent.lastLookupAt.getTime() >= LOOKUP_EVERY_MS;
        if (isOpen(intent.status) && due) {
            await this.lookUp(sessionId);
            intent = await prisma.paymentIntent.findFirstOrThrow({
                where,
                select: INTENT_SELECT,
            });
        }
        return view(intent);
    }

    /**
     * The customer came back from Stripe's Back link (KTD-8): the session
     * is expired at Stripe and the intent cancelled; a booking hold lets
     * its place go. A session Stripe won't expire (paid meanwhile) is
     * looked up and settled instead, never cancelled. Packs, plan joins
     * and orders stay as they are, to be paid again. Idempotent: a second
     * cancel expires and releases nothing.
     */
    async cancel(
        intentId: string,
        token: string,
    ): Promise<CheckoutSessionView> {
        const read = () =>
            prisma.paymentIntent.findFirst({
                where: { id: intentId, provider: "STRIPE" },
                select: INTENT_SELECT,
            });
        const intent = await read();
        if (!intent || !tokenMatches(stored(intent).cancelTokenHash, token)) {
            throw notFound();
        }

        if (isOpen(intent.status) && intent.providerCheckoutId) {
            const closed = await this.expire(intent);
            if (closed === false) {
                // Not open at Stripe: paid, under way, or already expired.
                await this.lookUp(intent.providerCheckoutId);
            }
            if (closed !== null) {
                // A paid or slow one has moved on above; what is still
                // waiting for payment can't be paid any more.
                await prisma.paymentIntent.updateMany({
                    where: {
                        id: intent.id,
                        status: { in: ["CREATED", "REQUIRES_PAYMENT"] },
                    },
                    data: { status: "CANCELLED" },
                });
            }
        }

        const after = (await read()) ?? intent;
        const invoice = after.invoice;
        if (
            after.status === "CANCELLED" &&
            invoice?.status === "DRAFT" &&
            invoice.source === "BOOKING" &&
            invoice.bookingId
        ) {
            const bookingId = invoice.bookingId;
            const released = await prisma.$transaction((tx) =>
                releaseHoldInTx(tx, bookingId, new Date()),
            );
            // Any other session the hold had can't be paid now either.
            if (released) await this.payments.cancelHoldIntents(bookingId);
            return view((await read()) ?? after);
        }
        return view(after);
    }

    /**
     * Expire the session at Stripe. True: expired now; false: Stripe says
     * it isn't open; null: Stripe couldn't say (logged, left as it is).
     */
    private async expire(intent: IntentRead): Promise<boolean | null> {
        try {
            const row = await prisma.merchantPaymentProvider.findUnique({
                where: {
                    organizationId_provider: {
                        organizationId: intent.organizationId,
                        provider: intent.provider,
                    },
                },
            });
            const adapter = this.providers.get(intent.provider);
            if (!row || !adapter.cancelIntent) return null;
            return await adapter.cancelIntent({
                providerIntentId: intent.providerCheckoutId ?? "",
                credentials: openProviderCredentials(row),
            });
        } catch (error) {
            // The adapter's message keeps only the HTTP status.
            this.logger.warn(
                `Could not expire Stripe session of intent ${intent.id}: ${String(error)}`,
            );
            return null;
        }
    }

    /** Ask Stripe about the session and settle what it has. Never throws. */
    private async lookUp(sessionId: string): Promise<void> {
        try {
            await this.lookup.confirmCheckoutReturn({
                provider: "STRIPE",
                providerOrderId: sessionId,
            });
        } catch (error) {
            this.logger.warn(
                `Could not look up a Stripe session: ${String(error)}`,
            );
        }
    }
}

function isOpen(status: string): boolean {
    return (OPEN_INTENT_STATUSES as readonly string[]).includes(status);
}

function stored(intent: IntentRead): Stored {
    const raw = intent.attempts[0]?.rawResponse;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

/** The cancel token against its stored SHA-256, in constant time. */
function tokenMatches(hash: string | undefined, token: string): boolean {
    if (!hash || !token) return false;
    const expected = Buffer.from(hash, "hex");
    const given = Buffer.from(hashCancelToken(token), "hex");
    return expected.length === given.length && timingSafeEqual(expected, given);
}

function notFound(): NotFoundException {
    return new NotFoundException("This payment wasn't found.");
}

/** The buyer-safe view, by named field only. */
function view(intent: IntentRead): CheckoutSessionView {
    const raw = stored(intent);
    const kind: CheckoutKind =
        raw.checkoutKind ?? (intent.invoiceId ? "invoice" : "order");
    const booking = kind === "hold" ? intent.invoice?.booking : null;
    const service = (
        booking?.snapshot as { service?: { name?: unknown } } | null
    )?.service;
    return {
        status: statusOf(intent, raw),
        kind,
        businessName: intent.organization.name,
        amountCents: intent.amountCents,
        currency: intent.currency,
        booking: booking
            ? {
                  serviceName:
                      typeof service?.name === "string" ? service.name : "",
                  startAt: booking.startAt.toISOString(),
                  endAt: booking.endAt.toISOString(),
                  timezone: booking.timezone,
              }
            : null,
        returnPath: safeReturnPath(raw.returnPath),
    };
}

function statusOf(intent: IntentRead, raw: Stored): CheckoutSessionStatus {
    switch (intent.status) {
        case "SUCCEEDED":
            // Taken, but owed back: a hold whose place had gone, a booking
            // cancelled meanwhile (the late-hold refund, U5).
            return intent.attempts.some(
                (a) => a.status === CAPTURED_NEEDS_REFUND,
            )
                ? "refunding"
                : "paid";
        case "PROCESSING":
            return "processing";
        case "FAILED":
            return "failed";
        case "CREATED":
        case "REQUIRES_PAYMENT":
            return raw.expiresAt &&
                new Date(raw.expiresAt).getTime() <= Date.now()
                ? "closed"
                : "open";
        default:
            // CANCELLED, SUPERSEDED.
            return "closed";
    }
}
