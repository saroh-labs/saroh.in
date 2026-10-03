import { Logger } from "@nestjs/common";

import { FlagKey } from "../../feature-flags/flags";
import { maskVpa } from "../mandate-rules";
import { providerCallSignal } from "./provider-call";
import type {
    CancelMandateInput,
    CreateMandateSetupInput,
    FindMandateChargeInput,
    FoundMandateCharge,
    GetMandateInput,
    GetPreDebitInput,
    MandateCapability,
    MandateChargeInput,
    MandateChargeResult,
    MandateMethod,
    MandateSetupResult,
    PreDebitStatus,
    PreparedMandateCharge,
    PrepareMandateChargeInput,
    ProviderCredentials,
    ProviderMandate,
    ProviderMandateStatus,
} from "./provider.port";
import { MandateCallError } from "./provider.port";

/**
 * Razorpay recurring payments as Saroh's mandate port (round-2 D19), made
 * of the calls the D11 spike saw work in test mode
 * (`docs/patterns/backend-integrations.md`, "Razorpay recurring payments"):
 *
 * - set-up, in the site's window (D12, the default): a customer
 *   (`POST /customers`) and an authorisation order (`POST /orders` with
 *   `method` and a `token` block) that Checkout opens with `recurring: "1"`.
 *   The order is the set-up reference, and for UPI and card its payment is
 *   the invoice's;
 * - set-up by a hosted link (`HOSTED_LINK`): a registration link
 *   (`POST /subscription_registration/auth_links`) for the method the
 *   customer picked, whose `short_url` they approve on. Its `inv_…` is the
 *   set-up reference;
 * - read: the token (`GET /customers/:c/tokens/:t`), or before one is
 *   known, the order's (or link's) payment → the token;
 * - charge: an order carrying `notification{token_id, payment_after}` for
 *   UPI (the pre-debit notice), then `POST /payments/create/recurring`;
 * - cancel: `PUT /customers/:c/tokens/:t/cancel` (never `DELETE`, which
 *   leaves the mandate live).
 *
 * Errors are sanitised to the call, the HTTP status and Razorpay's short
 * `reason` code — never its prose, the request, or a credential. A 4xx is
 * `REFUSED`; a network error, 409, 429 or 5xx is `UNKNOWN`; a debit asked
 * before the notice is out is `NOT_YET`.
 */

const BASE_URL = "https://api.razorpay.com/v1";

/**
 * The methods a Razorpay account took recurring orders for in the D11
 * spike. Razorpay has no API that says which an account has on (spike
 * Q14); a method it hasn't is refused at set-up, and the customer is
 * told to pick another. NACH needs a paper form: out of scope.
 */
export const RAZORPAY_MANDATE_METHODS: readonly MandateMethod[] = [
    "UPI",
    "CARD",
    "EMANDATE",
];

/**
 * The least a Razorpay authorisation takes by each method, in paise: UPI
 * and card are real payments of at least ₹1 (D11 spike); eMandate
 * authorises for 0. With nothing owed Saroh takes this as the ₹1 check and
 * refunds it (DEC-064).
 */
export const RAZORPAY_AUTHORISATION_MINIMUM_CENTS: Readonly<
    Partial<Record<MandateMethod, number>>
> = { UPI: 100, CARD: 100 };

/** Methods whose debit waits on Razorpay's pre-debit notice (D11 spike). */
const PRE_DEBIT_METHODS: ReadonlySet<MandateMethod> = new Set(["UPI"]);

type Json = Record<string, unknown>;

export class RazorpayMandates implements MandateCapability {
    readonly rolloutFlag = FlagKey.RAZORPAY_AUTOPAY;
    readonly authorisationMinimumCents = RAZORPAY_AUTHORISATION_MINIMUM_CENTS;
    private readonly logger = new Logger("RazorpayMandates");

    constructor(private readonly baseUrl: string = BASE_URL) {}

    mandateMethods(): Promise<MandateMethod[]> {
        return Promise.resolve([...RAZORPAY_MANDATE_METHODS]);
    }

    createSetup(input: CreateMandateSetupInput): Promise<MandateSetupResult> {
        return input.handoff === "HOSTED_LINK"
            ? this.createLinkSetup(input)
            : this.createCheckoutSetup(input);
    }

    /**
     * The in-page set-up (D12): Razorpay's customer, then the authorisation
     * ORDER for the picked method with its `token` block, opened in
     * Checkout with `recurring: "1"`. The order is the set-up reference:
     * for UPI and card its first payment (`firstAmountCents`) is the
     * invoice's, so that payment's `payment.captured` both pays the invoice
     * (by its order, the invoice intent's `providerIntentId`) and names the
     * token (`mandate-link.ts`). With nothing owed, UPI and card take the
     * ₹1 check instead ({@link RAZORPAY_AUTHORISATION_MINIMUM_CENTS},
     * DEC-064), refunded once captured. eMandate's order is for 0.
     */
    private async createCheckoutSetup(
        input: CreateMandateSetupInput,
    ): Promise<MandateSetupResult> {
        const made = await this.call(
            "set-up",
            input.credentials,
            "POST",
            "/customers",
            // "0": the customer Razorpay already has for this email and
            // phone comes back, rather than a refusal.
            { ...customerOf(input), fail_existing: "0" },
        );
        const providerCustomerId = text(made.id);
        if (!providerCustomerId) {
            throw new MandateCallError(
                "Razorpay set-up: missing customer id",
                "UNKNOWN",
            );
        }
        const method = input.method.toLowerCase();
        const order = await this.call(
            "set-up",
            input.credentials,
            "POST",
            "/orders",
            {
                amount: input.firstAmountCents,
                currency: input.currency,
                customer_id: providerCustomerId,
                method,
                receipt: input.reference,
                payment_capture: true,
                notes: { saroh_mandate_id: input.reference },
                token: {
                    max_amount: input.maxAmountCents,
                    expire_at: unix(input.expiresAt),
                    // eMandate's token takes no frequency.
                    ...(input.method === "EMANDATE"
                        ? {}
                        : { frequency: input.frequency.toLowerCase() }),
                },
            },
        );
        const setupReference = text(order.id);
        if (!setupReference) {
            // It said yes without naming what it made: it may exist.
            throw new MandateCallError(
                "Razorpay set-up: missing order id",
                "UNKNOWN",
            );
        }
        return {
            providerCustomerId,
            setupReference,
            authorisationUrl: null,
            clientParams: {
                razorpayOrderId: setupReference,
                razorpayCustomerId: providerCustomerId,
                recurring: true,
                method,
                // Where Checkout sends the customer when it has to leave
                // the page (a bank's eMandate page): the business's site.
                ...(input.returnUrl ? { callbackUrl: input.returnUrl } : {}),
            },
        };
    }

    /**
     * A hosted registration link (`HOSTED_LINK`, for a set-up link sent to
     * the customer, D13/D14): its `short_url` is the page to approve on,
     * its `inv_…` the reference, and its order and customer are handed back
     * for a Checkout window too.
     */
    private async createLinkSetup(
        input: CreateMandateSetupInput,
    ): Promise<MandateSetupResult> {
        const customer = customerOf(input);

        const link = await this.call(
            "set-up",
            input.credentials,
            "POST",
            "/subscription_registration/auth_links",
            {
                customer,
                type: "link",
                amount: input.firstAmountCents,
                currency: input.currency,
                description: input.description.slice(0, 255),
                receipt: input.reference,
                expire_by: unix(input.setupExpiresAt),
                // Saroh sends its own messages; Razorpay's would be a
                // second, unbranded one.
                sms_notify: false,
                email_notify: false,
                // No `callback_url`: the D11 spike didn't see a registration
                // link take one, and an unknown field is a 400. The return
                // page rides in `clientParams` for a window on this link's
                // order; D13/D14 confirm it before sending links.
                subscription_registration: {
                    method: input.method.toLowerCase(),
                    max_amount: input.maxAmountCents,
                    expire_at: unix(input.expiresAt),
                    frequency: input.frequency.toLowerCase(),
                },
                notes: { saroh_mandate_id: input.reference },
            },
        );
        const setupReference = text(link.id);
        const providerCustomerId = text(link.customer_id);
        if (!setupReference || !providerCustomerId) {
            // It said yes without naming what it made: it may exist.
            throw new MandateCallError(
                "Razorpay set-up: missing link or customer id",
                "UNKNOWN",
            );
        }
        const orderId = text(link.order_id);
        return {
            providerCustomerId,
            setupReference,
            // The link's payment is made on its order: a check's intent
            // (DEC-064) is recorded under it, where its capture lands.
            ...(orderId ? { paymentReference: orderId } : {}),
            authorisationUrl: text(link.short_url) ?? null,
            clientParams: {
                ...(orderId ? { razorpayOrderId: orderId } : {}),
                razorpayCustomerId: providerCustomerId,
                recurring: true,
                method: input.method.toLowerCase(),
                ...(input.returnUrl ? { callbackUrl: input.returnUrl } : {}),
            },
        };
    }

    async get(input: GetMandateInput): Promise<ProviderMandate> {
        const { credentials } = input;
        let customerId = input.providerCustomerId;
        let tokenId = input.providerMandateId;
        let setupPayment: ProviderMandate["setupPayment"];

        if (!tokenId && input.setupReference?.startsWith("order_")) {
            // An in-page set-up (D12): the order's payment that made a token.
            const payments = await this.call(
                "read",
                credentials,
                "GET",
                `/orders/${encodeURIComponent(input.setupReference)}/payments`,
            );
            const items = Array.isArray(payments.items)
                ? (payments.items as Json[])
                : [];
            const paid = items.find(
                (p) =>
                    text(p.token_id) &&
                    (p.status === "captured" || p.status === "authorized"),
            );
            // The authorisation's own payment, captured or not: a ₹1 check
            // whose capture webhook was lost is refunded from this (DEC-064).
            const captured = items.find(
                (p) => text(p.id) && p.status === "captured",
            );
            const capturedId = captured ? text(captured.id) : undefined;
            setupPayment = capturedId
                ? { providerPaymentRef: capturedId, captured: true }
                : null;
            if (!paid) {
                return {
                    status: "PENDING",
                    providerMandateId: null,
                    providerCustomerId: customerId ?? null,
                    method: null,
                    displayHint: null,
                    maxAmountCents: null,
                    expiresAt: null,
                    failureReason: null,
                    setupPayment,
                };
            }
            tokenId = text(paid.token_id) ?? null;
            customerId = text(paid.customer_id) ?? customerId;
        } else if (!tokenId && input.setupReference) {
            const link = await this.call(
                "read",
                credentials,
                "GET",
                `/invoices/${encodeURIComponent(input.setupReference)}`,
            );
            customerId = text(link.customer_id) ?? customerId;
            const paymentId = text(link.payment_id);
            if (!paymentId) {
                const status = text(link.status);
                const lapsed = status === "expired" || status === "cancelled";
                return {
                    status: lapsed ? "FAILED" : "PENDING",
                    providerMandateId: null,
                    providerCustomerId: customerId ?? null,
                    method: null,
                    displayHint: null,
                    maxAmountCents: null,
                    expiresAt: null,
                    failureReason: lapsed ? `setup_${status}` : null,
                };
            }
            const payment = await this.call(
                "read",
                credentials,
                "GET",
                `/payments/${encodeURIComponent(paymentId)}`,
            );
            tokenId = text(payment.token_id) ?? null;
            customerId = text(payment.customer_id) ?? customerId;
        }
        if (!tokenId || !customerId) {
            throw new MandateCallError(
                "Razorpay read: no token or customer to read",
                "REFUSED",
            );
        }
        const token = await this.call(
            "read",
            credentials,
            "GET",
            tokenPath(customerId, tokenId),
        );
        return {
            ...razorpayTokenView(token),
            providerCustomerId: customerId,
            ...(setupPayment !== undefined ? { setupPayment } : {}),
        };
    }

    async prepareCharge(
        input: PrepareMandateChargeInput,
    ): Promise<PreparedMandateCharge> {
        const { credentials, reference } = input;
        // The same reference is the same order: a retry after an unsure
        // answer finds the one it made instead of making a second.
        const found = await this.call(
            "prepare",
            credentials,
            "GET",
            `/orders?receipt=${encodeURIComponent(reference)}&count=1`,
        );
        const items = Array.isArray(found.items) ? (found.items as Json[]) : [];
        const made = items.find((o) => o.receipt === reference);
        if (made) return preparedView(made, input.debitAt);

        const needsNotice = input.method
            ? PRE_DEBIT_METHODS.has(input.method)
            : true; // a mandate whose method is unknown is treated as UPI
        const order = await this.call(
            "prepare",
            credentials,
            "POST",
            "/orders",
            {
                amount: input.amountCents,
                currency: input.currency,
                receipt: reference,
                payment_capture: true,
                notes: { saroh_charge: reference },
                ...(needsNotice
                    ? {
                          notification: {
                              token_id: input.providerMandateId,
                              payment_after: unix(input.debitAt),
                          },
                      }
                    : {}),
            },
        );
        if (!text(order.id)) {
            throw new MandateCallError(
                "Razorpay prepare: missing order id",
                "UNKNOWN",
            );
        }
        return preparedView(order, input.debitAt);
    }

    async getPreDebit(input: GetPreDebitInput): Promise<PreDebitStatus> {
        const order = await this.call(
            "notice",
            input.credentials,
            "GET",
            `/orders/${encodeURIComponent(input.providerIntentId)}`,
        );
        return preDebitStatus(order.notification);
    }

    async charge(input: MandateChargeInput): Promise<MandateChargeResult> {
        const { credentials } = input;
        // Asked again for the same order: the debit it already made.
        const earlier = await this.call(
            "charge",
            credentials,
            "GET",
            `/orders/${encodeURIComponent(input.providerIntentId)}/payments`,
        );
        const paid = (
            Array.isArray(earlier.items) ? (earlier.items as Json[]) : []
        ).find((p) => text(p.id) && p.status !== "failed");
        if (paid) {
            return {
                providerPaymentRef: text(paid.id) ?? null,
                status: chargeStatus(paid.status),
            };
        }

        if (!input.providerCustomerId) {
            throw new MandateCallError(
                "Razorpay charge: no customer id",
                "REFUSED",
            );
        }
        // Razorpay wants the customer's email and phone on the debit; they
        // are read from its own customer, never kept by Saroh here.
        const customer = await this.call(
            "charge",
            credentials,
            "GET",
            `/customers/${encodeURIComponent(input.providerCustomerId)}`,
        );
        const pay = await this.call(
            "charge",
            credentials,
            "POST",
            "/payments/create/recurring",
            {
                ...(text(customer.email) ? { email: customer.email } : {}),
                ...(text(customer.contact)
                    ? { contact: customer.contact }
                    : {}),
                amount: input.amountCents,
                currency: input.currency,
                order_id: input.providerIntentId,
                customer_id: input.providerCustomerId,
                token: input.providerMandateId,
                // As the D11 spike sent it (and Razorpay took it).
                recurring: true,
                notes: { saroh_charge: input.reference },
            },
        );
        const paymentId = text(pay.razorpay_payment_id);
        // No id: it took the request; the payment webhook, or the next
        // ask above, says what became of it.
        return { providerPaymentRef: paymentId ?? null, status: "PENDING" };
    }

    /**
     * The debit on a prepared order, from its payments (D13): a captured
     * one first, then one still in flight, then a failed one; none at all
     * is `NONE`, and a debit may be asked for.
     */
    async findCharge(
        input: FindMandateChargeInput,
    ): Promise<FoundMandateCharge> {
        const found = await this.call(
            "look up",
            input.credentials,
            "GET",
            `/orders/${encodeURIComponent(input.providerIntentId)}/payments`,
        );
        const payments = (
            Array.isArray(found.items) ? (found.items as Json[]) : []
        ).filter((p) => text(p.id));
        const pick = (status: MandateChargeResult["status"]) =>
            payments.find((p) => chargeStatus(p.status) === status);
        const hit = pick("SUCCEEDED") ?? pick("PENDING") ?? pick("FAILED");
        if (!hit) return { status: "NONE", providerPaymentRef: null };
        return {
            status: chargeStatus(hit.status),
            providerPaymentRef: text(hit.id) ?? null,
        };
    }

    async cancel(input: CancelMandateInput): Promise<void> {
        const { providerCustomerId, providerMandateId, credentials } = input;
        if (!providerCustomerId) {
            throw new MandateCallError(
                "Razorpay cancel: no customer id",
                "REFUSED",
            );
        }
        const path = tokenPath(providerCustomerId, providerMandateId);
        try {
            await this.call("cancel", credentials, "PUT", `${path}/cancel`);
        } catch (err) {
            if (!(err instanceof MandateCallError) || err.outcome !== "REFUSED")
                throw err;
            // Refused: maybe because it is already cancelled, which is a
            // success. Ask how the token stands before saying no.
            const token = await this.call("cancel", credentials, "GET", path);
            if (razorpayTokenView(token).status !== "CANCELLED") throw err;
        }
    }

    /**
     * One Razorpay call. Only the call's name, the status and Razorpay's
     * `reason` code leave this function; its body, the auth header and the
     * key never do.
     */
    private async call(
        what: string,
        credentials: ProviderCredentials,
        method: "GET" | "POST" | "PUT",
        path: string,
        body?: Json,
    ): Promise<Json> {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: `Basic ${basicAuth(credentials)}`,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: providerCallSignal(),
            });
        } catch {
            // A dropped connection, or no answer in time: it may have been
            // done, so UNKNOWN, never a refusal.
            throw new MandateCallError(
                `Razorpay ${what} failed: network error`,
                "UNKNOWN",
            );
        }
        let json: Json = {};
        try {
            const parsed: unknown = await res.json();
            if (parsed && typeof parsed === "object") json = parsed as Json;
        } catch {
            if (res.ok) {
                // It said yes, but what to is unreadable: it may be done.
                throw new MandateCallError(
                    `Razorpay ${what} failed: unreadable response`,
                    "UNKNOWN",
                );
            }
        }
        if (res.ok) return json;

        const reason = errorReason(json);
        this.logger.warn(
            `Razorpay ${what} failed with HTTP ${res.status}${reason ? ` (${reason})` : ""}`,
        );
        throw new MandateCallError(
            `Razorpay ${what} failed (HTTP ${res.status}${reason ? `, ${reason}` : ""})`,
            outcomeFor(res.status, reason),
        );
    }
}

/**
 * A Razorpay token in Saroh's words: its state, method, and only what it
 * gives as displayable — a masked UPI handle or a card's last four. An
 * eMandate's bank account is never kept, not even in part.
 */
export function razorpayTokenView(
    token: Json,
): Omit<ProviderMandate, "providerCustomerId"> {
    const details = (token.recurring_details ?? {}) as Json;
    const method = mandateMethodOf(token.method);
    return {
        status: tokenStatus(details.status),
        providerMandateId: text(token.id) ?? null,
        method,
        displayHint: displayHintOf(method, token),
        maxAmountCents: wholePositive(token.max_amount),
        expiresAt: fromUnix(token.expired_at),
        failureReason: text(details.failure_reason) ?? null,
    };
}

/** Razorpay's `recurring_details.status` → Saroh's. */
export function tokenStatus(status: unknown): ProviderMandateStatus {
    switch (status) {
        case "confirmed":
            return "ACTIVE";
        case "paused":
            return "PAUSED";
        case "cancelled":
        case "expired":
            return "CANCELLED";
        case "rejected":
            return "FAILED";
        default:
            // `initiated`, or anything new: not yet decided.
            return "PENDING";
    }
}

export function mandateMethodOf(method: unknown): MandateMethod | null {
    switch (method) {
        case "upi":
            return "UPI";
        case "card":
            return "CARD";
        case "emandate":
            return "EMANDATE";
        default:
            return null;
    }
}

function displayHintOf(
    method: MandateMethod | null,
    token: Json,
): string | null {
    if (method === "UPI") {
        const vpa = token.vpa;
        if (vpa && typeof vpa === "object") {
            const v = vpa as Json;
            return maskVpa(text(v.username), text(v.handle));
        }
        return null;
    }
    if (method === "CARD") {
        const last4 = text((token.card as Json | undefined)?.last4);
        return last4 && /^\d{4}$/.test(last4) ? `•••• ${last4}` : null;
    }
    return null;
}

function preDebitStatus(notification: unknown): PreDebitStatus {
    if (!notification || typeof notification !== "object") return "NOT_NEEDED";
    switch ((notification as Json).status) {
        case "delivered":
            return "DELIVERED";
        case "failed":
            return "FAILED";
        default:
            return "PENDING";
    }
}

function preparedView(order: Json, debitAt: Date): PreparedMandateCharge {
    const notification =
        order.notification && typeof order.notification === "object"
            ? (order.notification as Json)
            : null;
    return {
        providerIntentId: text(order.id) ?? "",
        debitAfter: notification
            ? (fromUnix(notification.payment_after) ?? debitAt)
            : new Date(),
        preDebitStatus: preDebitStatus(notification),
        preDebitRef: notification ? (text(notification.id) ?? null) : null,
    };
}

function chargeStatus(status: unknown): MandateChargeResult["status"] {
    if (status === "captured") return "SUCCEEDED";
    if (status === "failed") return "FAILED";
    return "PENDING";
}

/** Razorpay's short machine reason (`pre_debit_notification_not_sent`), only if code-shaped. */
function errorReason(body: Json): string | undefined {
    const error = body.error;
    if (!error || typeof error !== "object") return undefined;
    const reason = (error as Json).reason;
    return typeof reason === "string" && /^[a-z0-9_]{1,64}$/.test(reason)
        ? reason
        : undefined;
}

function outcomeFor(
    status: number,
    reason: string | undefined,
): "REFUSED" | "UNKNOWN" | "NOT_YET" {
    if (reason === "pre_debit_notification_not_sent") return "NOT_YET";
    if (status === 409 || status === 429 || status >= 500) return "UNKNOWN";
    return "REFUSED";
}

/** Who authorises, as Razorpay's customer: only what it needs to reach them. */
function customerOf(input: CreateMandateSetupInput): Json {
    const customer: Json = { name: input.customer.name.slice(0, 50) };
    if (input.customer.email) customer.email = input.customer.email;
    if (input.customer.phone) customer.contact = input.customer.phone;
    return customer;
}

function tokenPath(customerId: string, tokenId: string): string {
    return `/customers/${encodeURIComponent(customerId)}/tokens/${encodeURIComponent(tokenId)}`;
}

function basicAuth(credentials: ProviderCredentials): string {
    return Buffer.from(
        `${credentials.keyId}:${credentials.keySecret}`,
    ).toString("base64");
}

function unix(date: Date): number {
    return Math.floor(date.getTime() / 1000);
}

function fromUnix(value: unknown): Date | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? new Date(value * 1000)
        : null;
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

function wholePositive(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value > 0
        ? value
        : null;
}
