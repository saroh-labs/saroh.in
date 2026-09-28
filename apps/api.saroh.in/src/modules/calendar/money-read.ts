import type { prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import type { MoneySource } from "./money";
import type { CalendarLink, LayerKey } from "./month";
import { dayOf } from "./month";

/**
 * The calendar's money reads (plan 005 E19): paper paid and credited, and
 * the fees providers reported, in a month — see `money.ts` for how they
 * count. Both read the whole business, whatever layers the caller sees:
 * money is the Payments scope (`payment:read`), and each rupee counts once
 * whichever layer it belongs to.
 */

type Db = typeof prisma;
interface Window {
    start: Date;
    end: Date;
}

/** The captures a fee is dated by: a payment that arrived, applied or not. */
const CAPTURES = ["CAPTURED", CAPTURED_NEEDS_REFUND];

function personName(
    p: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null,
): string | null {
    if (!p) return null;
    const full = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;
    const email = p.email?.trim();
    if (email) return email;
    return null;
}

/** An invoice's layer, by what it bills. */
function layerOf(source: string): LayerKey {
    if (source === "SUBSCRIPTION") return "subscriptions";
    if (source === "BOOKING") return "bookings";
    return "invoices";
}

interface Paper {
    id: string;
    number: string | null;
    source: string;
    orderId: string | null;
    bookingId: string | null;
    subscriptionId: string | null;
    order: { orderId: string } | null;
}

/**
 * Where a piece of paper's money sits, best first, and what it is called:
 * an order's paper is its order's money; any other invoice's sits on the
 * invoice, else on its booking or subscription that day. A credit note's
 * home is the invoice it credits.
 */
function placeOf(
    paper: Paper,
    credited: string | null = null,
): { layer: LayerKey; title: string; links: CalendarLink[] } {
    if (paper.orderId) {
        return {
            layer: "orders",
            title: paper.order?.orderId ?? paper.number ?? "Order",
            links: [{ type: "order", id: paper.orderId }],
        };
    }
    const links: CalendarLink[] = [
        { type: "invoice", id: credited ?? paper.id },
    ];
    if (paper.bookingId) links.push({ type: "booking", id: paper.bookingId });
    if (paper.subscriptionId) {
        links.push({ type: "subscription", id: paper.subscriptionId });
    }
    return {
        layer: layerOf(paper.source),
        title: paper.number ?? "Invoice",
        links,
    };
}

const paperSelect = {
    id: true,
    number: true,
    source: true,
    orderId: true,
    bookingId: true,
    subscriptionId: true,
    order: { select: { orderId: true } },
} as const;

const contactSelect = {
    select: { firstName: true, lastName: true, email: true },
} as const;

/**
 * Money in and handed back this month, from the paper: every invoice and
 * supplementary invoice on the day it was paid (an order's or not — one
 * later credited still took its money that day), and every credit note on
 * the day it was issued. Draft and void paper moved nothing.
 */
export async function readPaperMoney(
    db: Db,
    organizationId: string,
    window: Window,
    zone: string,
): Promise<MoneySource[]> {
    const between = { gte: window.start, lt: window.end };
    const rows = await db.invoice.findMany({
        where: {
            organizationId,
            status: { notIn: ["DRAFT", "VOID"] },
            OR: [
                { kind: { in: ["INVOICE", "SUPPLEMENTARY"] }, paidAt: between },
                { kind: "CREDIT_NOTE", issuedAt: between },
            ],
        },
        select: {
            ...paperSelect,
            kind: true,
            total: true,
            currency: true,
            paidAt: true,
            issuedAt: true,
            relatedInvoiceId: true,
            billToName: true,
            contact: contactSelect,
        },
    });
    return rows.flatMap((inv): MoneySource[] => {
        const refund = inv.kind === "CREDIT_NOTE";
        const at = refund ? inv.issuedAt : inv.paidAt;
        if (!at) return [];
        const place = placeOf(inv, refund ? inv.relatedInvoiceId : null);
        return [
            {
                date: dayOf(at, zone),
                kind: refund
                    ? "refund"
                    : inv.orderId
                      ? "order_paid"
                      : "invoice_paid",
                ...place,
                subtitle: inv.billToName ?? personName(inv.contact),
                currency: inv.currency,
                cents: Math.abs(toMinor(inv.total)),
            },
        ];
    });
}

/**
 * The fees providers reported this month, each on the day its payment was
 * captured (default 47) — the first capture recorded for the intent, else
 * when the intent last changed. A payment with no reported fee is not here.
 */
export async function readFees(
    db: Db,
    organizationId: string,
    window: Window,
    zone: string,
): Promise<MoneySource[]> {
    const between = { gte: window.start, lt: window.end };
    const rows = await db.paymentIntent.findMany({
        where: {
            organizationId,
            feeCents: { gt: 0 },
            OR: [
                {
                    attempts: {
                        some: { status: { in: CAPTURES }, createdAt: between },
                    },
                },
                {
                    attempts: { none: { status: { in: CAPTURES } } },
                    updatedAt: between,
                },
            ],
        },
        select: {
            feeCents: true,
            currency: true,
            updatedAt: true,
            orderId: true,
            order: { select: { orderId: true } },
            invoice: { select: paperSelect },
            attempts: {
                where: { status: { in: CAPTURES } },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { createdAt: true },
            },
        },
    });
    return rows.flatMap((intent): MoneySource[] => {
        const fee = intent.feeCents ?? 0;
        if (fee <= 0) return [];
        const paper: Paper | null = intent.orderId
            ? {
                  id: intent.orderId,
                  number: null,
                  source: "ORDER",
                  orderId: intent.orderId,
                  bookingId: null,
                  subscriptionId: null,
                  order: intent.order,
              }
            : intent.invoice;
        if (!paper) return [];
        const at = intent.attempts[0]?.createdAt ?? intent.updatedAt;
        return [
            {
                date: dayOf(at, zone),
                kind: "fee",
                ...placeOf(paper),
                subtitle: "Provider fee",
                currency: intent.currency,
                cents: fee,
            },
        ];
    });
}
