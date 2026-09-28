import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { resolveContact } from "../customer-workspace/resolve-contact";
import { buildManualInvoice } from "../invoices/order-invoice";
import {
    documentColumns,
    loadTaxProfile,
    numberFor,
    writeDocumentLines,
} from "../invoices/order-invoicing";
import { toCents } from "../invoices/totals";

/**
 * A class pack bought online by a signed-in customer (round-2 A11, R12;
 * ADR-011) — the invoice side, as plain functions on the caller's
 * transaction, like `bookings/booking-hold.ts` for a pay-now hold.
 *
 * Starting to pay makes a DRAFT invoice (source PACK, no number) billed to
 * the customer's contact, priced from the pack on the server, with the
 * pack's terms — name, credits, validity, price — snapshotted on it
 * (`packTerms`). The business's provider takes the payment through the
 * invoice payment path; nothing is bought until its webhook arrives. Then,
 * under the invoice's row lock, {@link completePackDraftInTx} numbers the
 * invoice PAID and makes the `PackPurchase` from the snapshot, so a pack the
 * merchant changed or archived meanwhile still sells on the terms shown.
 *
 * An unpaid draft is voided after {@link PACK_DRAFT_HOURS} by the hold sweep
 * ({@link discardStalePackDrafts}). It never had a number, so the series has
 * no hole (DEC-023). It is voided rather than deleted: its payment intent
 * hangs off it, and a payment that lands afterwards must still find it and
 * be recorded as owed back.
 */

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** How long an online pack draft waits to be paid before it is discarded. */
export const PACK_DRAFT_HOURS = 24;

/** The most unfinished pack payments an account may have at once. */
export const MAX_OPEN_PACK_ATTEMPTS = 3;

/** Why a discarded draft was voided. */
export const PACK_DRAFT_DISCARDED_REASON =
    "Not paid within 24 hours, so no pack was bought.";

/** Why a draft for a pack whose terms changed was voided. */
export const PACK_DRAFT_REPLACED_REASON =
    "The pack changed before it was paid for, so it was started again.";

/** The pack as it was sold: what the purchase is made from. */
export interface PackTerms {
    packId: string;
    name: string;
    credits: number;
    validityDays: number;
    /** A decimal string, as the pack stores it. */
    price: string;
    currency: string;
}

/** The terms of a pack as it is on sale now (its published columns). */
export function packTermsOf(pack: {
    id: string;
    name: string;
    credits: number;
    validityDays: number;
    price: { toString(): string };
    currency: string;
}): PackTerms {
    return {
        packId: pack.id,
        name: pack.name,
        credits: pack.credits,
        validityDays: pack.validityDays,
        price: Number(pack.price.toString()).toFixed(2),
        currency: pack.currency,
    };
}

const isPositiveInt = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v > 0;
const isText = (v: unknown): v is string =>
    typeof v === "string" && v.length > 0;

/** A draft's snapshot, checked; null when it has none or it is malformed. */
export function readPackTerms(
    value: Prisma.JsonValue | null | undefined,
): PackTerms | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const v = value as Record<string, unknown>;
    if (
        !isText(v.packId) ||
        !isText(v.name) ||
        !isPositiveInt(v.credits) ||
        !isPositiveInt(v.validityDays) ||
        !isText(v.price) ||
        !Number.isFinite(Number(v.price)) ||
        !isText(v.currency)
    ) {
        return null;
    }
    return {
        packId: v.packId,
        name: v.name,
        credits: v.credits,
        validityDays: v.validityDays,
        price: v.price,
        currency: v.currency,
    };
}

/** Whether two snapshots sell the same thing at the same price. */
export function sameTerms(a: PackTerms, b: PackTerms): boolean {
    return (
        a.packId === b.packId &&
        a.name === b.name &&
        a.credits === b.credits &&
        a.validityDays === b.validityDays &&
        toCents(a.price) === toCents(b.price) &&
        a.currency === b.currency
    );
}

/** The invoice line, as the desk's sale words it. */
export function packLineDescription(terms: PackTerms): string {
    return `${terms.name} · ${terms.credits} ${terms.credits === 1 ? "class" : "classes"}`;
}

/** When a purchase made at `at` runs out: its validity from the payment. */
export function packExpiry(terms: PackTerms, at: Date): Date {
    return new Date(at.getTime() + terms.validityDays * DAY_MS);
}

/** An account's pack payments still waiting: drafts inside their 24 hours. */
export function openPackDraftsWhere(
    organizationId: string,
    contactId: string,
    now: Date,
): Prisma.InvoiceWhereInput {
    return {
        organizationId,
        contactId,
        kind: "INVOICE",
        source: "PACK",
        status: "DRAFT",
        number: null,
        createdAt: { gt: new Date(now.getTime() - PACK_DRAFT_HOURS * HOUR_MS) },
    };
}

/**
 * The draft a customer pays: billed to their contact, one line for the pack,
 * priced from the snapshot (GST inside the price, as the desk's sale is).
 */
export async function createPackDraftInTx(
    tx: Tx,
    input: {
        organizationId: string;
        contactId: string;
        billToName: string | null;
        billToEmail: string | null;
        terms: PackTerms;
    },
): Promise<{ id: string; total: Prisma.Decimal; currency: string }> {
    const profile = await loadTaxProfile(tx, input.organizationId);
    const doc = buildManualInvoice(
        [
            {
                description: packLineDescription(input.terms),
                quantity: 1,
                unitCents: toCents(input.terms.price),
                rateBps: null,
                code: null,
            },
        ],
        profile,
        null,
        0,
    );
    const created = await tx.invoice.create({
        data: {
            organizationId: input.organizationId,
            status: "DRAFT",
            kind: "INVOICE",
            source: "PACK",
            contactId: input.contactId,
            billToName: input.billToName,
            billToEmail: input.billToEmail,
            currency: input.terms.currency,
            ...documentColumns(doc),
            packTerms: { ...input.terms },
        },
        select: { id: true, total: true, currency: true },
    });
    await writeDocumentLines(tx, input.organizationId, created.id, doc);
    return created;
}

/**
 * Money arrived for an online pack's draft (the webhook, under the
 * invoice's row lock, after the intent's). The purchase is made from the
 * snapshot — the credits, the price and the validity shown when the
 * customer started paying, counted from now — and the invoice takes its
 * number and is written PAID, naming the purchase.
 *
 * "gone" when it can't be bought any more: the draft is no longer a draft
 * (paid by another intent, or discarded), its snapshot or pack is missing,
 * or its contact was removed. The caller then records the capture as owed
 * back, as for any invoice that could not take it.
 *
 * The buyer is the contact the draft names, through any merge since (C9).
 */
export async function completePackDraftInTx(
    tx: Tx,
    input: {
        invoiceId: string;
        organizationId: string;
        now: Date;
        payment: {
            paymentMethod: string;
            paymentReference: string | null;
            paymentNote: string;
        };
    },
): Promise<"bought" | "gone"> {
    const { now, organizationId } = input;
    const draft = await tx.invoice.findFirst({
        where: {
            id: input.invoiceId,
            organizationId,
            status: "DRAFT",
            source: "PACK",
            number: null,
        },
        select: { id: true, contactId: true, packTerms: true },
    });
    const terms = readPackTerms(draft?.packTerms);
    if (!draft?.contactId || !terms) return "gone";

    const buyer = await resolveContact(tx, draft.contactId, organizationId);
    if (!buyer || buyer.removed) return "gone";
    // Archived or changed since is fine: the snapshot is what was sold. A
    // pack is never deleted once anyone might hold it, but check anyway.
    const pack = await tx.classPack.findFirst({
        where: { id: terms.packId, organizationId },
        select: { id: true },
    });
    if (!pack) return "gone";

    const purchase = await tx.packPurchase.create({
        data: {
            organizationId,
            packId: pack.id,
            contactId: buyer.id,
            credits: terms.credits,
            price: terms.price,
            currency: terms.currency,
            expiresAt: packExpiry(terms, now),
        },
        select: { id: true },
    });
    const profile = await loadTaxProfile(tx, organizationId);
    const number = await numberFor(tx, organizationId, profile, "INVOICE", now);
    await tx.invoice.update({
        where: { id: draft.id },
        data: {
            status: "PAID",
            number,
            issuedAt: now,
            dueAt: now,
            paidAt: now,
            contactId: buyer.id,
            packPurchaseId: purchase.id,
            ...input.payment,
        },
    });
    return "bought";
}

/**
 * Void the online pack drafts nobody paid within {@link PACK_DRAFT_HOURS}
 * (run by the hold sweep, `bookings/release-holds.handler.ts`). Across
 * businesses, as the sweep's other work is. Returns how many.
 *
 * A payment that lands afterwards finds a VOID invoice and is recorded as
 * owed back (`webhooks.service.ts`), like a hold paid too late.
 */
export async function discardStalePackDrafts(
    now: Date,
    db: Pick<Tx, "invoice"> = prisma,
): Promise<number> {
    const { count } = await db.invoice.updateMany({
        where: {
            source: "PACK",
            status: "DRAFT",
            number: null,
            createdAt: {
                lte: new Date(now.getTime() - PACK_DRAFT_HOURS * HOUR_MS),
            },
        },
        data: {
            status: "VOID",
            voidedAt: now,
            voidReason: PACK_DRAFT_DISCARDED_REASON,
        },
    });
    return count;
}
