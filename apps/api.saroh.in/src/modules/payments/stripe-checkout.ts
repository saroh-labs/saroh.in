import { createHash, randomBytes } from "node:crypto";

import { Logger } from "@nestjs/common";
import type { MerchantPaymentProvider } from "@saroh/database";
import { prisma } from "@saroh/database";

import { lockBookingInTx } from "../bookings/booking-hold";
import { isReservedContactEmail } from "../contacts/contact-email";
import { rendererBase, siteOriginOf } from "../sites/site-origin";
import type {
    HostedCheckoutInput,
    MerchantProvider,
    ProviderCredentials,
} from "./providers/provider.port";

/**
 * Saroh's side of a Stripe hosted Checkout (plan 2026-11-07-002, U4): what
 * the session says about the thing paid for, who pays, where the customer
 * comes back to, and the booking hold it may extend. Plain functions, read
 * by `PaymentsService.createIntentFor` only when the provider is Stripe.
 */

const logger = new Logger("StripeCheckout");

/** Stripe's shortest session life ("30 minutes to 24 hours", STRIPE.md). */
export const CHECKOUT_MIN_MINUTES = 30;
/** Stripe's default session life, when Saroh sends no `expires_at`. */
export const CHECKOUT_DEFAULT_HOURS = 24;
/** Added to the shortest life so clock skew never makes Stripe refuse it. */
const EXPIRY_MARGIN_MS = 60_000;

/** What a Stripe payment is for, as the return page names it (U7). */
export type CheckoutKind = "hold" | "pack" | "join" | "invoice" | "order";

/** The stored row's facts a session needs. */
export interface StripeCheckoutTarget {
    kind: CheckoutKind;
    /** A DRAFT invoice starts something on payment: instant methods only. */
    instantOnly: boolean;
    lineName: string;
    payerEmail: string | null;
    payerName: string | null;
    /** The business's Contact the `cus_…` is recorded on, when known. */
    contactId: string | null;
    /** A booking hold's booking, whose hold follows the session. */
    holdBookingId: string | null;
    /**
     * An order sent to an address: its country (ISO alpha-2), so an Indian
     * account's session asks for the shipping address India's export rules
     * need for goods. Null for anything not delivered.
     */
    deliveryCountry: string | null;
}

/**
 * Read the order or invoice the payment is for. An invoice's payer is its
 * bill-to; an order's is its store customer, and its contact the one the
 * customer is linked to. A placeholder address (a phone-only account) is
 * no email.
 */
export async function stripeCheckoutTarget(target: {
    kind: "order" | "invoice";
    id: string;
}): Promise<StripeCheckoutTarget> {
    if (target.kind === "invoice") {
        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: target.id },
            select: {
                status: true,
                source: true,
                number: true,
                bookingId: true,
                contactId: true,
                billToEmail: true,
                billToName: true,
                lines: {
                    orderBy: { position: "asc" },
                    take: 1,
                    select: { description: true },
                },
            },
        });
        const draft = invoice.status === "DRAFT";
        const kind: CheckoutKind = !draft
            ? "invoice"
            : invoice.source === "BOOKING"
              ? "hold"
              : invoice.source === "PACK"
                ? "pack"
                : invoice.source === "SUBSCRIPTION"
                  ? "join"
                  : "invoice";
        return {
            kind,
            instantOnly: draft,
            lineName: lineName(
                draft
                    ? invoice.lines[0]?.description
                    : invoice.number && `Invoice ${invoice.number}`,
                "Payment",
            ),
            payerEmail: payerEmail(invoice.billToEmail),
            payerName: blankToNull(invoice.billToName),
            contactId: invoice.contactId,
            holdBookingId: kind === "hold" ? invoice.bookingId : null,
            deliveryCountry: null,
        };
    }
    const order = await prisma.order.findUniqueOrThrow({
        where: { id: target.id },
        select: {
            orderId: true,
            fulfilment: true,
            deliveryCountry: true,
            customer: {
                select: {
                    email: true,
                    firstName: true,
                    lastName: true,
                    identityLinks: {
                        orderBy: { createdAt: "asc" },
                        take: 1,
                        select: { contactId: true },
                    },
                },
            },
        },
    });
    const name = [order.customer?.firstName, order.customer?.lastName]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(" ");
    const delivered =
        order.fulfilment === "SHIPPING" ||
        order.fulfilment === "LOCAL_DELIVERY";
    const country = order.deliveryCountry?.trim().toUpperCase() ?? "";
    return {
        kind: "order",
        instantOnly: false,
        lineName: lineName(`Order ${order.orderId}`, "Order"),
        payerEmail: payerEmail(order.customer?.email),
        payerName: name || null,
        contactId: order.customer?.identityLinks[0]?.contactId ?? null,
        holdBookingId: null,
        deliveryCountry:
            delivered && /^[A-Z]{2}$/.test(country) ? country : null,
    };
}

function lineName(text: string | null | undefined, fallback: string): string {
    return (blankToNull(text) ?? fallback).slice(0, 250);
}

function blankToNull(text: string | null | undefined): string | null {
    const t = text?.trim();
    return t === undefined || t === "" ? null : t;
}

function payerEmail(email: string | null | undefined): string | null {
    const e = email?.trim().toLowerCase();
    return e && !isReservedContactEmail(e) ? e : null;
}

/**
 * A same-site path the customer goes back to, or null to use the kind's
 * default (U7). Only a relative path on the business's own site: one `/`,
 * no scheme, no `//` or `\`, no control characters, at most 512 characters.
 * Anything else is ignored, never refused.
 */
export function safeReturnPath(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const path = raw.trim();
    if (path.length === 0 || path.length > 512) return null;
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    // A backslash reads as a slash in browsers (`/\evil.example`); control
    // characters can split or hide what follows.
    if (
        path.includes("\\") ||
        [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    ) {
        return null;
    }
    return path;
}

/** The hash a cancel token is stored as; the token is only in the URL. */
export function hashCancelToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/**
 * Where Stripe sends the customer, on the business's own site
 * (`<origin>/paid`), else the renderer's apex (`/pay/paid`) for a business
 * with no live site. Built here, never from the request.
 *
 * Success carries `{CHECKOUT_SESSION_ID}`, which Stripe fills. Cancel
 * can't: Stripe documents the template for `success_url` only (STRIPE.md),
 * and the session id isn't known until the session is made. So the cancel
 * URL carries Saroh's own intent id (made before the call) and a random
 * 32-byte token whose SHA-256 is kept on the intent's first attempt
 * (`cancelTokenHash`). Chosen over an HMAC of the intent id: no new server
 * secret to hold or rotate, and a leaked URL closes one checkout at most.
 * The intent id alone is not enough, as a guessed one must not let a
 * stranger release someone's booking.
 */
export async function checkoutReturnUrls(
    organizationId: string,
    intentId: string,
): Promise<{ successUrl: string; cancelUrl: string; cancelTokenHash: string }> {
    const origin = await siteOriginOf(organizationId);
    const page = origin ? `${origin}/paid` : `${rendererBase()}/pay/paid`;
    const token = randomBytes(32).toString("base64url");
    const cancel = new URLSearchParams({
        cancelled: "1",
        intent: intentId,
        token,
    });
    return {
        // Stripe replaces the literal `{CHECKOUT_SESSION_ID}`, so it is not
        // encoded.
        successUrl: `${page}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${page}?${cancel.toString()}`,
        cancelTokenHash: hashCancelToken(token),
    };
}

/** What the intent's first attempt keeps beside `clientParams` (U7 reads it). */
export interface StoredCheckout {
    checkoutKind: CheckoutKind;
    returnPath: string | null;
    cancelTokenHash: string;
    /** When the session stops taking payment (ISO). */
    expiresAt: string;
}

/**
 * Everything a Stripe session needs from Saroh's side. Never fails the
 * payment for a customer or country read: those only shape the session.
 */
export async function prepareStripeCheckout(input: {
    organizationId: string;
    target: { kind: "order" | "invoice"; id: string };
    providerRow: MerchantPaymentProvider;
    adapter: MerchantProvider;
    credentials: ProviderCredentials;
    intentId: string;
    returnPath?: unknown;
    now?: Date;
}): Promise<{
    hosted: HostedCheckoutInput;
    stored: StoredCheckout;
    holdBookingId: string | null;
    /** The key can't read or make customers: flag the connection. */
    permissionMissing: boolean;
}> {
    const { organizationId, providerRow, adapter, credentials, intentId } =
        input;
    const now = input.now ?? new Date();
    const detail = await stripeCheckoutTarget(input.target);

    const country = await accountCountryOf(providerRow, adapter, credentials);
    // India's export rules (STRIPE.md): an Indian account needs the payer's
    // billing address, and an address it can't read is treated as Indian
    // (owner, 7 Nov: payments never fail for it).
    const indianOrUnknown = country === null || country === "IN";

    const customer = adapter.findOrCreateCustomer
        ? await adapter.findOrCreateCustomer({
              email: detail.payerEmail,
              name: detail.payerName,
              organizationId,
              contactRef: detail.contactId,
              credentials,
          })
        : { customerId: null };
    if (customer.customerId && detail.contactId) {
        await recordStripeCustomer(
            organizationId,
            detail.contactId,
            customer.customerId,
        );
    }

    // A hold's session ends with its hold: Stripe's shortest life, plus a
    // margin. Anything else keeps Stripe's default day.
    const expiresAt =
        detail.kind === "hold"
            ? new Date(
                  now.getTime() +
                      CHECKOUT_MIN_MINUTES * 60_000 +
                      EXPIRY_MARGIN_MS,
              )
            : undefined;
    const urls = await checkoutReturnUrls(organizationId, intentId);

    return {
        hosted: {
            successUrl: urls.successUrl,
            cancelUrl: urls.cancelUrl,
            ...(expiresAt ? { expiresAt } : {}),
            instantOnly: detail.instantOnly,
            submitType: detail.kind === "hold" ? "book" : "pay",
            lineName: detail.lineName,
            clientReference: intentId,
            customerId: customer.customerId,
            payerEmail: detail.payerEmail,
            billingAddressRequired: indianOrUnknown,
            ...(indianOrUnknown && detail.deliveryCountry
                ? { shippingCountries: [detail.deliveryCountry] }
                : {}),
        },
        stored: {
            checkoutKind: detail.kind,
            returnPath: safeReturnPath(input.returnPath),
            cancelTokenHash: urls.cancelTokenHash,
            expiresAt: (
                expiresAt ??
                new Date(now.getTime() + CHECKOUT_DEFAULT_HOURS * 3_600_000)
            ).toISOString(),
        },
        holdBookingId: detail.holdBookingId,
        permissionMissing: Boolean(customer.permissionMissing),
    };
}

/**
 * The connection's country: stored, else asked once and stored (a
 * connection made before the column fills on its next checkout). Null when
 * Stripe won't say; asked again next time.
 */
async function accountCountryOf(
    row: MerchantPaymentProvider,
    adapter: MerchantProvider,
    credentials: ProviderCredentials,
): Promise<string | null> {
    if (row.accountCountry) return row.accountCountry;
    if (!adapter.accountCountry) return null;
    const country = await adapter.accountCountry(credentials);
    if (country) await storeAccountCountry(row, country);
    return country;
}

/** Keep the account's country on the connection. Never throws. */
export async function storeAccountCountry(
    row: Pick<MerchantPaymentProvider, "id" | "organizationId">,
    country: string,
): Promise<void> {
    try {
        await prisma.merchantPaymentProvider.updateMany({
            where: { id: row.id, organizationId: row.organizationId },
            data: { accountCountry: country },
        });
    } catch (err) {
        logger.warn(
            `Could not store the account country of provider ${row.id}: ${errorText(err)}`,
        );
    }
}

/**
 * Record the payer's `cus_…` on the business's contact, outside the
 * payment's transaction: a record for the merchant, so a failure is only
 * logged.
 */
async function recordStripeCustomer(
    organizationId: string,
    contactId: string,
    customerId: string,
): Promise<void> {
    try {
        await prisma.contact.updateMany({
            where: { id: contactId, organizationId },
            data: { stripeCustomerId: customerId },
        });
    } catch (err) {
        logger.warn(
            `Could not record the Stripe customer on contact ${contactId}: ${errorText(err)}`,
        );
    }
}

/**
 * Move a held booking's expiry to its session's, so the hold and the
 * session end together (KTD-9): under the booking's lock, only while it is
 * still held, and only later. Never throws: a hold that keeps its own time
 * is released by the sweep, which closes the session.
 */
export async function extendHoldToSession(
    bookingId: string,
    expiresAt: Date,
): Promise<void> {
    try {
        await prisma.$transaction(async (tx) => {
            await lockBookingInTx(tx, bookingId);
            await tx.booking.updateMany({
                where: {
                    id: bookingId,
                    status: "PENDING",
                    holdExpiresAt: { gt: new Date(), lt: expiresAt },
                },
                data: { holdExpiresAt: expiresAt },
            });
        });
    } catch (err) {
        logger.warn(
            `Could not extend the hold of booking ${bookingId}: ${errorText(err)}`,
        );
    }
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : "unknown error";
}
