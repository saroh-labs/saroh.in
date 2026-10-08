import { createHmac, timingSafeEqual } from "node:crypto";

import { Logger } from "@nestjs/common";

import type {
    BillingEventPhase,
    BillingProvider,
    CancelSubscriptionOptions,
    CheckoutStatus,
    CreateOrderInput,
    CreateProviderPlanInput,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    NextChargeItem,
    ParsedBillingEvent,
    ProviderChargeCapability,
    ProviderOrderCapability,
    ProviderPlanCapability,
    ProviderStatusCapability,
    SubscriptionStatus,
    WebhookHeaders,
} from "./billing-provider.port";
import { BillingProviderError, headerValue } from "./billing-provider.port";
import {
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    readPlatformSecret,
    requirePlatformSecret,
} from "./platform-secrets";

/** How long one call to Razorpay may take (Node's fetch has no deadline). */
const CALL_TIMEOUT_MS = 15_000;

/**
 * How many charges a subscription is made for when the caller names none.
 * Razorpay asks for a count (`total_count`). The checkout names its term
 * (DEC-093: 12 monthly charges); this open-ended fallback is what U15 made
 * before there was a term. Confirmed accepted in test mode (OQ-6).
 */
const TOTAL_COUNT: Record<string, number> = { month: 120, year: 10 };

/** Razorpay's order ids; an order is a one-time payment, never cancelled. */
const ORDER_PREFIX = "order_";

/** How many pages of plans `findPlan` reads before giving up. */
const FIND_PLAN_PAGES = 5;
const FIND_PLAN_PAGE_SIZE = 100;

/** The note Saroh's reference travels in on a Razorpay object. */
const REFERENCE_NOTE = "saroh_ref";

/**
 * Razorpay PLATFORM billing adapter (S7-005, U15).
 *
 * Charges an Organization for its Saroh subscription via the Razorpay
 * Subscriptions API, authenticated with Saroh's OWN platform key
 * (`SAROH_RAZORPAY_KEY_ID` / `SAROH_RAZORPAY_KEY_SECRET`). Webhooks are verified
 * with `SAROH_RAZORPAY_WEBHOOK_SECRET`.
 *
 * U15 adds the provider plans the catalogue's paid rows bill on
 * (`POST /plans`), a subscription on one of them with a start date and an
 * upfront charge, and cancel now or at the cycle's end. Written to Razorpay's
 * published API and **not yet run against test mode**: the spike's answers
 * are recorded as unverified in `docs/architecture/PRICING_ROLLOUT.md`.
 *
 * CREDENTIAL BOUNDARY: this adapter reads ONLY those `SAROH_*` platform vars —
 * never a per-org merchant credential. Errors are SANITIZED to the HTTP status
 * only; the auth header, key secret, and raw body are never logged or surfaced.
 */
export class RazorpayBillingProvider implements BillingProvider {
    readonly name = "RAZORPAY";
    private readonly logger = new Logger(RazorpayBillingProvider.name);
    private readonly baseUrl = "https://api.razorpay.com/v1";
    private readonly signatureHeaderName = "x-razorpay-signature";

    /** The HTTP call; a spec swaps it for a fake. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);

    readonly plans: ProviderPlanCapability = {
        findPlan: (reference) => this.findPlan(reference),
        createPlan: (input) => this.createPlan(input),
    };

    readonly charges: ProviderChargeCapability = {
        addToNextCharge: (item) => this.addToNextCharge(item),
    };

    readonly orders: ProviderOrderCapability = {
        createOrder: (input) => this.createOrder(input),
    };

    readonly statuses: ProviderStatusCapability = {
        checkoutStatus: (ref, oneTime) =>
            oneTime ? this.orderStatus(ref) : this.subscriptionStatus(ref),
    };

    /** The key id Checkout opens with: public by design, never the secret. */
    publicKey(): string | null {
        return readPlatformSecret(RAZORPAY_KEY_ID) ?? null;
    }

    async createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        // A coupon (U16). Razorpay takes money off a subscription only
        // through an Offer made in its Dashboard and passed as `offer_id`
        // (confirmed in test mode; Offers can't be made through the API).
        // A coupon without one is refused, asking nothing: never charge the
        // full amount for a discounted plan. Razorpay applies the Offer's
        // own discount, so it must match the coupon's; there is no
        // documented way to read an Offer's terms back to check
        // (`PRICING_ROLLOUT.md`).
        const offerId =
            input.discount && input.discount.amountPaise > 0
                ? (input.discount.razorpayOfferId ?? null)
                : undefined;
        if (offerId === null) {
            throw new BillingProviderError(
                "REFUSED",
                "Razorpay subscription creation refused: the coupon has no Razorpay offer",
            );
        }
        const openEnded = TOTAL_COUNT[input.interval] ?? TOTAL_COUNT.month;
        const body: Record<string, unknown> = {
            total_count: input.totalCount ?? openEnded,
            quantity: 1,
            customer_notify: 1,
            notes: {
                sarohPlanKey: input.planKey,
                organizationId: input.organizationId,
                ...(input.reference
                    ? { [REFERENCE_NOTE]: input.reference }
                    : {}),
            },
        };
        if (input.providerPlanId) body.plan_id = input.providerPlanId;
        if (offerId) body.offer_id = offerId;
        if (input.startAt) {
            body.start_at = Math.floor(input.startAt.getTime() / 1000);
        }
        if (input.upfront && input.upfront.amountPaise > 0) {
            body.addons = [
                {
                    item: {
                        name: input.upfront.name,
                        amount: input.upfront.amountPaise,
                        currency: input.currency,
                    },
                },
            ];
        }
        const res = await this.call(
            "subscription creation",
            "POST",
            "/subscriptions",
            body,
        );
        const json = (await res.json()) as {
            id?: string;
            customer_id?: string;
            status?: string;
            short_url?: string;
            current_end?: number | null;
        };
        if (!json.id) {
            throw new BillingProviderError(
                "UNKNOWN",
                "Razorpay subscription creation failed: missing subscription id",
            );
        }
        return {
            providerSubscriptionId: json.id,
            providerCustomerId: json.customer_id,
            status: statusFor(json.status) ?? "ACTIVE",
            currentPeriodEnd: unixDate(json.current_end),
            ...(json.short_url ? { authorisationUrl: json.short_url } : {}),
        };
    }

    async cancelSubscription(
        providerSubscriptionId: string,
        options: CancelSubscriptionOptions = {},
    ): Promise<void> {
        // A one-time payment has nothing to cancel: paid, it's done; unpaid,
        // Razorpay lets the order lapse on its own (DEC-093).
        if (providerSubscriptionId.startsWith(ORDER_PREFIX)) return;
        await this.call(
            "subscription cancel",
            "POST",
            `/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
            { cancel_at_cycle_end: options.atCycleEnd === false ? 0 : 1 },
        );
    }

    verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): boolean {
        const provided = headerValue(headers, this.signatureHeaderName);
        if (!provided) return false;

        // Platform webhook secret, resolved at use time. A secret-free throw if
        // it is unset would surface as a 500; a missing secret means we cannot
        // verify, so treat it as a verification failure instead.
        const secret = this.webhookSecretOrNull();
        if (!secret) return false;

        const expected = createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        return safeEqualHex(provided, expected);
    }

    parseWebhook(
        payload: unknown,
        headers: WebhookHeaders = {},
    ): ParsedBillingEvent {
        const body = (payload ?? {}) as {
            event?: string;
            created_at?: number;
            payload?: {
                subscription?: {
                    entity?: {
                        id?: string;
                        status?: string;
                        current_end?: number | null;
                    };
                };
                payment?: { entity?: { id?: string } };
                order?: { entity?: { id?: string } };
            };
        };

        const type = body.event ?? "unknown";
        const entity = body.payload?.subscription?.entity;
        // A yearly plan's one payment (DEC-093): the order stands where a
        // subscription would, and its `order.paid` is the charge.
        const order =
            type === "order.paid" ? body.payload?.order?.entity : undefined;
        const providerSubscriptionId = entity?.id ?? order?.id;

        return {
            type,
            // Razorpay's own id for this delivery; without it, the event's
            // time. `type:subscription` alone was the same for every month's
            // `subscription.charged`, so the second was dropped (PAY-04).
            providerEventId:
                headerValue(headers, "x-razorpay-event-id") ??
                `${type}:${providerSubscriptionId ?? "unknown"}:${body.created_at ?? "unknown"}`,
            providerSubscriptionId,
            status: outcomeFor(type),
            phase: phaseFor(type),
            eventAt: unixDate(body.created_at),
            ...(entity && "current_end" in entity
                ? { currentPeriodEnd: unixDate(entity.current_end) }
                : {}),
            ...(body.payload?.payment?.entity?.id
                ? { providerPaymentId: body.payload.payment.entity.id }
                : {}),
        };
    }

    // ── One-time payments and asking how a checkout stands (DEC-093) ────

    /** A yearly plan's one payment: an order Checkout pays. */
    private async createOrder(
        input: CreateOrderInput,
    ): Promise<{ providerOrderId: string }> {
        const res = await this.call("order creation", "POST", "/orders", {
            amount: input.amountPaise,
            currency: input.currency,
            receipt: input.reference.slice(0, 40),
            notes: {
                sarohPlanKey: input.planKey,
                organizationId: input.organizationId,
                [REFERENCE_NOTE]: input.reference,
            },
        });
        const json = (await res.json()) as { id?: string };
        if (!json.id) {
            throw new BillingProviderError(
                "UNKNOWN",
                "Razorpay order creation failed: missing order id",
            );
        }
        return { providerOrderId: json.id };
    }

    /**
     * A subscription as Razorpay holds it now, read as the event its
     * webhook would send: authorised but not yet charged (a start date
     * ahead), charged, or ended. `created` is still waiting.
     */
    private async subscriptionStatus(id: string): Promise<CheckoutStatus> {
        const res = await this.call(
            "subscription lookup",
            "GET",
            `/subscriptions/${encodeURIComponent(id)}`,
        );
        const json = (await res.json()) as {
            status?: string;
            current_end?: number | null;
            paid_count?: number;
        };
        const end = unixDate(json.current_end);
        switch (json.status) {
            case "authenticated":
                return { phase: "authenticated", status: "IGNORED" };
            case "active":
                return {
                    phase: (json.paid_count ?? 0) > 0 ? "charged" : "activated",
                    status: "ACTIVE",
                    currentPeriodEnd: end,
                };
            case "pending":
                return { phase: "pending", status: "PAST_DUE" };
            case "halted":
                return { phase: "halted", status: "PAST_DUE" };
            case "cancelled":
            case "expired":
                return { phase: "cancelled", status: "CANCELLED" };
            case "completed":
                return {
                    phase: "completed",
                    status: "CANCELLED",
                    currentPeriodEnd: end,
                };
            default:
                return { phase: "other", status: "IGNORED" };
        }
    }

    /** An order: paid, or still waiting (`created`, `attempted`). */
    private async orderStatus(id: string): Promise<CheckoutStatus> {
        const res = await this.call(
            "order lookup",
            "GET",
            `/orders/${encodeURIComponent(id)}`,
        );
        const json = (await res.json()) as { status?: string };
        if (json.status !== "paid")
            return { phase: "other", status: "IGNORED" };
        const paid = await this.call(
            "order payments lookup",
            "GET",
            `/orders/${encodeURIComponent(id)}/payments`,
        );
        const list = (await paid.json()) as {
            items?: { id?: string; status?: string }[];
        };
        const payment = (list.items ?? []).find(
            (p) => p.status === "captured" && p.id,
        );
        return {
            phase: "charged",
            status: "ACTIVE",
            providerPaymentId: payment?.id ?? null,
        };
    }

    // ── Provider plans (U15) ────────────────────────────────────────────

    private async createPlan(
        input: CreateProviderPlanInput,
    ): Promise<{ providerPlanId: string }> {
        const res = await this.call("plan creation", "POST", "/plans", {
            period: input.period === "year" ? "yearly" : "monthly",
            interval: 1,
            item: {
                name: input.name,
                amount: input.amountPaise,
                currency: input.currency,
            },
            notes: { [REFERENCE_NOTE]: input.reference },
        });
        const json = (await res.json()) as { id?: string };
        if (!json.id) {
            throw new BillingProviderError(
                "UNKNOWN",
                "Razorpay plan creation failed: missing plan id",
            );
        }
        return { providerPlanId: json.id };
    }

    /**
     * Razorpay can't look a plan up by its notes, so this reads the newest
     * pages of plans and matches Saroh's reference. A plan made by a create
     * whose answer was lost is among the newest. Unverified (U15).
     */
    private async findPlan(reference: string): Promise<string | null> {
        for (let page = 0; page < FIND_PLAN_PAGES; page += 1) {
            const res = await this.call(
                "plan lookup",
                "GET",
                `/plans?count=${FIND_PLAN_PAGE_SIZE}&skip=${page * FIND_PLAN_PAGE_SIZE}`,
            );
            const json = (await res.json()) as {
                items?: { id?: string; notes?: Record<string, unknown> }[];
            };
            const items = json.items ?? [];
            const hit = items.find(
                (p) => p.notes?.[REFERENCE_NOTE] === reference && p.id,
            );
            if (hit?.id) return hit.id;
            if (items.length < FIND_PLAN_PAGE_SIZE) return null;
        }
        return null;
    }

    // ── Items on the next charge (U16) ──────────────────────────────────

    /**
     * An add-on owed for a period, as a one-off add-on on the subscription
     * (`POST /subscriptions/:id/addons`), which Razorpay charges with the
     * subscription's next invoice. Unverified (U16): that it is taken with
     * the next charge and not later, that a subscription that is only
     * authenticated (a trial) accepts one, and that a repeat after a lost
     * answer can't be told from a new one (Razorpay keeps no reference).
     */
    private async addToNextCharge(
        item: NextChargeItem,
    ): Promise<{ providerChargeId: string }> {
        const res = await this.call(
            "add-on item",
            "POST",
            `/subscriptions/${encodeURIComponent(item.providerSubscriptionId)}/addons`,
            {
                item: {
                    name: item.name,
                    amount: item.amountPaise,
                    currency: item.currency,
                    description: `${REFERENCE_NOTE}:${item.reference}`,
                },
                quantity: 1,
            },
        );
        const json = (await res.json()) as { id?: string };
        if (!json.id) {
            throw new BillingProviderError(
                "UNKNOWN",
                "Razorpay add-on item failed: missing id",
            );
        }
        return { providerChargeId: json.id };
    }

    // ── HTTP ────────────────────────────────────────────────────────────

    /**
     * One authenticated call. A 4xx is REFUSED (it would answer the same
     * again); anything else that isn't a success is UNKNOWN. Only the status
     * is kept: never the request, the auth header or Razorpay's body.
     */
    private async call(
        what: string,
        method: "GET" | "POST",
        path: string,
        body?: unknown,
    ): Promise<Response> {
        const basic = this.basicAuth();
        let res: Response;
        try {
            res = await this.fetchFn(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: `Basic ${basic}`,
                    ...(body === undefined
                        ? {}
                        : { "Content-Type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            });
        } catch {
            // Never echo the request — it carries the platform secret.
            throw new BillingProviderError(
                "UNKNOWN",
                `Razorpay ${what} failed: network error`,
            );
        }
        if (!res.ok) {
            this.logger.warn(`Razorpay ${what} failed with HTTP ${res.status}`);
            const refused =
                res.status >= 400 && res.status < 500 && res.status !== 429;
            throw new BillingProviderError(
                refused ? "REFUSED" : "UNKNOWN",
                `Razorpay ${what} failed (HTTP ${res.status})`,
            );
        }
        return res;
    }

    private basicAuth(): string {
        const keyId = requirePlatformSecret(RAZORPAY_KEY_ID);
        const keySecret = requirePlatformSecret(RAZORPAY_KEY_SECRET);
        return Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    }

    private webhookSecretOrNull(): string | null {
        const secret = globalThis.process.env[RAZORPAY_WEBHOOK_SECRET];
        return secret ?? null;
    }
}

/** A Razorpay unix timestamp (seconds) as a date, or null. */
function unixDate(seconds: number | null | undefined): Date | null {
    return typeof seconds === "number" && Number.isFinite(seconds)
        ? new Date(seconds * 1000)
        : null;
}

/** Map a Razorpay subscription event type → the target subscription status. */
function outcomeFor(type: string): SubscriptionStatus | "IGNORED" {
    switch (type) {
        case "order.paid":
        case "subscription.activated":
        case "subscription.charged":
        case "subscription.resumed":
            return "ACTIVE";
        case "subscription.pending":
        case "subscription.halted":
            return "PAST_DUE";
        case "subscription.cancelled":
        case "subscription.completed":
        case "subscription.expired":
            return "CANCELLED";
        default:
            return "IGNORED";
    }
}

/** What a Razorpay subscription event says happened (U15). */
function phaseFor(type: string): BillingEventPhase {
    switch (type) {
        case "subscription.authenticated":
            return "authenticated";
        case "subscription.activated":
        case "subscription.resumed":
            return "activated";
        case "subscription.charged":
        case "order.paid":
            return "charged";
        case "subscription.pending":
            return "pending";
        case "subscription.halted":
            return "halted";
        case "subscription.cancelled":
        case "subscription.expired":
            return "cancelled";
        case "subscription.completed":
            return "completed";
        default:
            return "other";
    }
}

/** Map a Razorpay subscription entity status → the canonical status. */
function statusFor(status: string | undefined): SubscriptionStatus | null {
    switch (status) {
        case "active":
        case "authenticated":
            return "ACTIVE";
        case "created":
            return "TRIALING";
        case "halted":
        case "pending":
            return "PAST_DUE";
        case "cancelled":
        case "completed":
        case "expired":
            return "CANCELLED";
        default:
            return null;
    }
}

/** Constant-time compare of two hex strings of equal length. */
function safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
    } catch {
        return false;
    }
}
