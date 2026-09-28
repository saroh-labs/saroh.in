import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime, IANAZone } from "luxon";

import { resolveContact } from "../customer-workspace/resolve-contact";
import { buildManualInvoice } from "../invoices/order-invoice";
import {
    documentColumns,
    loadTaxProfile,
    numberFor,
    writeDocumentLines,
} from "../invoices/order-invoicing";
import { toCents } from "../invoices/totals";
import { allowanceData } from "./classes-allowance";
import type { Interval } from "./periods";
import { INTERVALS, periodContaining, periodLabel } from "./periods";
import { customerActor, recordSubscriptionEvent } from "./subscription-events";

/**
 * A plan joined online by a signed-in customer from the site's Prices page
 * (round-2 G20) — the invoice side, as plain functions on the caller's
 * transaction, as `class-packs/pack-checkout.ts` is for a pack (A11).
 *
 * It follows A11's rule for an unpaid online invoice, so G20 adds no invoice
 * rule of its own: starting to pay makes a DRAFT invoice (source
 * SUBSCRIPTION, no number) billed to the customer's contact, priced from the
 * plan on the server, with the plan's terms snapshotted on it (`planTerms`).
 * Nobody is put on a plan until the payment's webhook arrives; then, under
 * the invoice's row lock, {@link completePlanJoinInTx} starts the
 * subscription from the snapshot — its first period holding the day it was
 * paid — and numbers the invoice PAID, as that period's invoice.
 *
 * An unpaid draft is voided after {@link PLAN_JOIN_HOURS} by the hold sweep
 * ({@link discardStalePlanJoins}); it never had a number, so the series has
 * no hole (DEC-023). A staff-issued SUBSCRIPTION invoice always has a
 * number, so "source SUBSCRIPTION, no number" is only ever one of these.
 *
 * No autopay: D12 (the customer sets up autopay) isn't built. Each renewal
 * after the first is invoiced as any member's is.
 */

type Tx = Prisma.TransactionClient;

const HOUR_MS = 3_600_000;

/** How long an online join waits to be paid before it is discarded. */
export const PLAN_JOIN_HOURS = 24;

/** The most unfinished plan joins an account may have at once. */
export const MAX_OPEN_PLAN_JOINS = 3;

/** Why a discarded join was voided. */
export const PLAN_JOIN_DISCARDED_REASON =
    "Not paid within 24 hours, so nobody joined the plan.";

/** Why a join for a plan whose terms changed was voided. */
export const PLAN_JOIN_REPLACED_REASON =
    "The plan changed before it was paid for, so it was started again.";

/** The plan as it was joined: what the subscription is made from. */
export interface PlanTerms {
    planId: string;
    name: string;
    /** A decimal string, as the plan stores it. */
    price: string;
    currency: string;
    interval: Interval;
    /** Classes a month; null is as many as they like. */
    classesPerMonth: number | null;
    /** The site account that joined: the subscription's log names it. */
    accountId: string;
}

/** The terms of a plan as it is on sale now (its published columns). */
export function planTermsOf(
    plan: {
        id: string;
        name: string;
        price: { toString(): string };
        currency: string;
        interval: string;
        classesPerMonth: number | null;
    },
    accountId: string,
): PlanTerms | null {
    const interval = INTERVALS.find((i) => i === plan.interval);
    if (!interval) return null;
    return {
        planId: plan.id,
        name: plan.name,
        price: Number(plan.price.toString()).toFixed(2),
        currency: plan.currency,
        interval,
        classesPerMonth: plan.classesPerMonth,
        accountId,
    };
}

const isText = (v: unknown): v is string =>
    typeof v === "string" && v.length > 0;

/** A draft's snapshot, checked; null when it has none or it is malformed. */
export function readPlanTerms(
    value: Prisma.JsonValue | null | undefined,
): PlanTerms | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const v = value as Record<string, unknown>;
    const interval = INTERVALS.find((i) => i === v.interval);
    const perMonth = v.classesPerMonth;
    if (
        !isText(v.planId) ||
        !isText(v.name) ||
        !isText(v.price) ||
        !Number.isFinite(Number(v.price)) ||
        !isText(v.currency) ||
        !interval ||
        !isText(v.accountId) ||
        !(
            perMonth === null ||
            (typeof perMonth === "number" &&
                Number.isInteger(perMonth) &&
                perMonth > 0)
        )
    ) {
        return null;
    }
    return {
        planId: v.planId,
        name: v.name,
        price: v.price,
        currency: v.currency,
        interval,
        classesPerMonth: perMonth,
        accountId: v.accountId,
    };
}

/** Whether two snapshots join the same plan on the same terms. */
export function samePlanTerms(a: PlanTerms, b: PlanTerms): boolean {
    return (
        a.planId === b.planId &&
        a.name === b.name &&
        toCents(a.price) === toCents(b.price) &&
        a.currency === b.currency &&
        a.interval === b.interval &&
        a.classesPerMonth === b.classesPerMonth
    );
}

/** An account's plan joins still waiting: drafts inside their 24 hours. */
export function openPlanJoinsWhere(
    organizationId: string,
    contactId: string,
    now: Date,
): Prisma.InvoiceWhereInput {
    return {
        organizationId,
        contactId,
        kind: "INVOICE",
        source: "SUBSCRIPTION",
        status: "DRAFT",
        number: null,
        createdAt: {
            gt: new Date(now.getTime() - PLAN_JOIN_HOURS * HOUR_MS),
        },
    };
}

/**
 * The draft a customer pays: billed to their contact, one line for the
 * plan's first period, priced from the snapshot (GST inside the price, as
 * a period's invoice is). The period is named when it is paid.
 */
export async function createPlanJoinDraftInTx(
    tx: Tx,
    input: {
        organizationId: string;
        contactId: string;
        billToName: string | null;
        billToEmail: string | null;
        terms: PlanTerms;
    },
): Promise<{ id: string; total: Prisma.Decimal; currency: string }> {
    const profile = await loadTaxProfile(tx, input.organizationId);
    const doc = buildManualInvoice(
        [
            {
                description: input.terms.name,
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
            source: "SUBSCRIPTION",
            contactId: input.contactId,
            billToName: input.billToName,
            billToEmail: input.billToEmail,
            currency: input.terms.currency,
            ...documentColumns(doc),
            planTerms: { ...input.terms },
        },
        select: { id: true, total: true, currency: true },
    });
    await writeDocumentLines(tx, input.organizationId, created.id, doc);
    return created;
}

/** The business's timezone, or UTC when it has none we know. */
async function businessZone(tx: Tx, organizationId: string): Promise<string> {
    const profile = await tx.businessProfile.findUnique({
        where: { organizationId },
        select: { timezone: true },
    });
    const zone = profile?.timezone;
    return zone && IANAZone.isValidZone(zone) ? zone : "UTC";
}

/**
 * Money arrived for an online join's draft (the webhook, under the
 * invoice's row lock, after the intent's). The subscription is started from
 * the snapshot — the price, how often and the classes a month shown when the
 * customer started paying — with its first period holding today in the
 * business's timezone, and the invoice takes its number and is written PAID
 * as that period's invoice.
 *
 * "gone" when it can't be joined any more: the draft is no longer a draft
 * (paid by another intent, or discarded), its snapshot or plan is missing,
 * its contact was removed, or they are already on the plan (the desk put
 * them on it meanwhile). The caller then records the capture as owed back,
 * as for any invoice that could not take it.
 *
 * The member is the contact the draft names, through any merge since (C9).
 */
export async function completePlanJoinInTx(
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
): Promise<"joined" | "gone"> {
    const { now, organizationId } = input;
    const draft = await tx.invoice.findFirst({
        where: {
            id: input.invoiceId,
            organizationId,
            status: "DRAFT",
            source: "SUBSCRIPTION",
            number: null,
        },
        select: { id: true, contactId: true, planTerms: true },
    });
    const terms = readPlanTerms(draft?.planTerms);
    if (!draft?.contactId || !terms) return "gone";

    const member = await resolveContact(tx, draft.contactId, organizationId);
    if (!member || member.removed) return "gone";
    // Archived or changed since is fine: the snapshot is what was joined. A
    // plan is never deleted while anyone might hold it, but check anyway.
    const plan = await tx.subscriptionPlan.findFirst({
        where: { id: terms.planId, organizationId },
        select: { id: true },
    });
    if (!plan) return "gone";
    // One live subscription per person per plan: the desk may have put
    // them on it meanwhile. Then nobody joins twice; the money is owed back.
    const live = await tx.customerSubscription.count({
        where: {
            organizationId,
            planId: plan.id,
            contactId: member.id,
            status: { not: "CANCELLED" },
        },
    });
    if (live > 0) return "gone";

    const timezone = await businessZone(tx, organizationId);
    const anchor = DateTime.fromJSDate(now, { zone: timezone })
        .startOf("day")
        .toJSDate();
    const period = periodContaining(anchor, terms.interval, timezone, now);
    const created = await tx.customerSubscription.create({
        data: {
            organizationId,
            planId: plan.id,
            contactId: member.id,
            status: "ACTIVE",
            price: terms.price,
            currency: terms.currency,
            interval: terms.interval,
            timezone,
            anchorAt: anchor,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            createdByUserId: null,
            // The classes a month shown when they joined, until the next
            // renewal takes the plan's again (D10).
            ...allowanceData(terms.classesPerMonth, now),
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
            contactId: member.id,
            subscriptionId: created.id,
            periodStart: period.start,
            periodEnd: period.end,
            ...input.payment,
        },
    });
    // The line names the period, as every period's invoice does.
    await tx.invoiceLine.updateMany({
        where: { invoiceId: draft.id, organizationId },
        data: {
            description: `${terms.name} · ${periodLabel(period, timezone)}`,
        },
    });
    await recordSubscriptionEvent(
        tx,
        organizationId,
        created.id,
        "SUBSCRIBED",
        customerActor(terms.accountId),
        {
            invoiceId: draft.id,
            data: {
                plan: {
                    id: terms.planId,
                    name: terms.name,
                    price: terms.price,
                    currency: terms.currency,
                    interval: terms.interval,
                },
                startsAt: null,
                online: true,
            },
        },
    );
    return "joined";
}

/**
 * Void the online plan joins nobody paid within {@link PLAN_JOIN_HOURS}
 * (run by the hold sweep, `bookings/release-holds.handler.ts`). Across
 * businesses, as the sweep's other work is. Returns how many.
 *
 * A payment that lands afterwards finds a VOID invoice and is recorded as
 * owed back (`webhooks.service.ts`), like a pack paid too late.
 */
export async function discardStalePlanJoins(
    now: Date,
    db: Pick<Tx, "invoice"> = prisma,
): Promise<number> {
    const { count } = await db.invoice.updateMany({
        where: {
            source: "SUBSCRIPTION",
            status: "DRAFT",
            number: null,
            createdAt: {
                lte: new Date(now.getTime() - PLAN_JOIN_HOURS * HOUR_MS),
            },
        },
        data: {
            status: "VOID",
            voidedAt: now,
            voidReason: PLAN_JOIN_DISCARDED_REASON,
        },
    });
    return count;
}
