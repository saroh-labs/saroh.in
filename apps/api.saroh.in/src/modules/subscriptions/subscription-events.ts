import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PLAN_EVENTS_PAGE_MAX } from "./dto";
import type {
    EventActor,
    EventActorKind,
    EventActorView,
} from "./event-actors";
import {
    actorFromContext,
    actorView,
    JOB_ACTOR,
    teamNames,
} from "./event-actors";

/**
 * A subscription's log (plan 2026-09-26-004, D9): one event for everything
 * done to it, written in the same transaction as the action, after the
 * subscription's row lock, with who did it. A refused action rolls back and
 * records nothing. Append-only: this file writes rows and reads them;
 * nothing here, or anywhere, updates or deletes one.
 */

export const SUBSCRIPTION_EVENT_KINDS = [
    /** Put on a plan; `invoiceId` is its first invoice, if one was issued. */
    "SUBSCRIBED",
    /** `data.until`: the day it resumes on its own, or null until resumed (D8). */
    "PAUSED",
    /** `data.extendedDays` inside the paid period; `data.restarted` after it, with the new invoice. */
    "RESUMED",
    /** Cancelled today. */
    "CANCELLED",
    /** Set to end with its period: `data.endsAt`. */
    "CANCEL_SCHEDULED",
    /** A cancel at period end taken back. */
    "KEPT",
    /** Its last period ran out and it stopped. */
    "ENDED",
    /** A move to `data.to` booked for `data.from`, the next renewal. */
    "PLAN_CHANGE_BOOKED",
    "PLAN_CHANGE_CANCELLED",
    /** A booked move took effect: `data.from` → `data.to`. */
    "PLAN_CHANGED",
    /** The collection day or note changed: `{ weekday: [b, a], note: [b, a] }`. */
    "COLLECTION_CHANGED",
    "COLLECTION_SKIPPED",
    "COLLECTION_UNSKIPPED",
    /** A period invoiced outside its renewal (a skip undone, a new day). */
    "INVOICED",
    /** The renewal job moved it to a new period, with its invoice or `data.uncharged`. */
    "RENEWED",
    /** "Retry now": a new pay link for `invoiceId`. */
    "RETRIED",
    /**
     * A pause's end date came, but the resume would restart billing with
     * Payments off (D8): `data.until`, `data.reason` PAYMENTS_OFF. Once a pause.
     */
    "RESUME_REFUSED",
    // Written by later units; named here so the log and its readers know them.
    /** A renewal's charge failed or wasn't answered (D13). */
    "RENEWAL_FAILED",
    /** The invoice is above the autopay limit, so it wasn't charged (D13). */
    "MANDATE_LIMIT_LOW",
    "MANDATE_SET_UP",
    "MANDATE_CANCELLED",
    /** Paid by autopay (D13). */
    "CHARGED",
] as const;
export type SubscriptionEventKind = (typeof SUBSCRIPTION_EVENT_KINDS)[number];

export type SubscriptionActor = EventActor & {
    /** The customer's site account, when they acted themselves (epic A). */
    customerAccountId?: string | null;
};

/** Who a team member's or an operator's request is recorded as. */
export function subscriptionActor(ctx: OrganizationContext): SubscriptionActor {
    return actorFromContext(ctx);
}

/** The renewal job. */
export const JOB: SubscriptionActor = JOB_ACTOR;

/**
 * The member, from their own account on the business's site (round-2 A8):
 * no user id, and the account that acted, so the log can say "from their
 * account" and never names a team member.
 */
export function customerActor(customerAccountId: string): SubscriptionActor {
    return { actorKind: "CUSTOMER", actorUserId: null, customerAccountId };
}

/**
 * A plan as an event names it: enough to say it in words later. A type,
 * not an interface, so it fits the JSON column's index signature.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- an interface has no index signature
export type EventPlanRef = {
    id: string;
    name: string;
    price: string;
    currency: string;
    interval: string;
};

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type SubscriptionEventData = Record<string, Json>;

export interface SubscriptionEventInput {
    invoiceId?: string | null;
    note?: string | null;
    data?: SubscriptionEventData;
}

/** Write one event. Called inside the action's own transaction. */
export async function recordSubscriptionEvent(
    tx: Prisma.TransactionClient,
    organizationId: string,
    subscriptionId: string,
    kind: SubscriptionEventKind,
    actor: SubscriptionActor,
    input: SubscriptionEventInput = {},
): Promise<void> {
    await tx.subscriptionEvent.create({
        data: {
            organizationId,
            subscriptionId,
            kind,
            actorKind: actor.actorKind,
            actorUserId: actor.actorUserId,
            customerAccountId: actor.customerAccountId ?? null,
            invoiceId: input.invoiceId ?? null,
            note: input.note ?? null,
            data: input.data ?? {},
        },
    });
}

/**
 * One subscription's log inside one transaction, bound to who is acting,
 * so each action records itself in a line: `await log("PAUSED")`.
 */
export type SubscriptionEventLog = (
    kind: SubscriptionEventKind,
    input?: SubscriptionEventInput,
) => Promise<void>;

export function subscriptionEventLog(
    tx: Prisma.TransactionClient,
    organizationId: string,
    subscriptionId: string,
    actor: SubscriptionActor,
): SubscriptionEventLog {
    return (kind, input) =>
        recordSubscriptionEvent(
            tx,
            organizationId,
            subscriptionId,
            kind,
            actor,
            input,
        );
}

/**
 * The collection schedule's fields that changed, each as `[before, after]`;
 * empty when nothing did, and nothing is recorded.
 */
export function collectionChanges(
    before: { weekday: number | null; note: string | null },
    after: { weekday: number | null; note: string | null },
): SubscriptionEventData {
    const changes: SubscriptionEventData = {};
    if (before.weekday !== after.weekday) {
        changes.weekday = [before.weekday, after.weekday];
    }
    if (before.note !== after.note) changes.note = [before.note, after.note];
    return changes;
}

// — Reading ——————————————————————————————————————————————————————————

export const SUBSCRIPTION_EVENTS_PAGE = 50;

export interface SubscriptionEventView {
    id: string;
    kind: SubscriptionEventKind;
    /** Who did it, named as `event-actors.ts` says. */
    actor: EventActorView<EventActorKind>;
    /**
     * The invoice it issued or acted on. Null without `invoice:read`, as
     * every invoice on a subscription is.
     */
    invoice: { id: string; number: string | null } | null;
    note: string | null;
    data: SubscriptionEventData;
    createdAt: string;
}

export interface SubscriptionEventsPage {
    /** Newest first. */
    events: SubscriptionEventView[];
    /** The last event's id on this page, to ask for the next; null at the end. */
    nextCursor: string | null;
    /**
     * The subscription began before its log was kept (the D9 deploy), so
     * the oldest event isn't its start: "Earlier changes weren't recorded".
     */
    earlierUnrecorded: boolean;
}

/**
 * A subscription's events, newest first, paged by the last event's id.
 * Another business's subscription, or a cursor that isn't one of this
 * subscription's events, is refused before anything is read.
 */
export async function listSubscriptionEvents(
    organizationId: string,
    subscriptionId: string,
    options: { cursor?: string; limit?: number; showInvoices: boolean },
): Promise<SubscriptionEventsPage> {
    const sub = await prisma.customerSubscription.findFirst({
        where: { id: subscriptionId, organizationId },
        select: { id: true },
    });
    if (!sub) throw new NotFoundException("Subscription not found");

    const take = Math.min(
        Math.max(options.limit ?? SUBSCRIPTION_EVENTS_PAGE, 1),
        PLAN_EVENTS_PAGE_MAX,
    );
    const mine = { organizationId, subscriptionId };
    let after: Prisma.SubscriptionEventWhereInput = {};
    if (options.cursor) {
        const from = await prisma.subscriptionEvent.findFirst({
            where: { ...mine, id: options.cursor },
            select: { id: true, createdAt: true },
        });
        if (!from) {
            throw new BadRequestException({
                message: "That page of the changes isn't there any more",
                details: { field: "cursor" },
            });
        }
        after = {
            OR: [
                { createdAt: { lt: from.createdAt } },
                { createdAt: from.createdAt, id: { lt: from.id } },
            ],
        };
    }

    const [rows, started] = await Promise.all([
        prisma.subscriptionEvent.findMany({
            where: { ...mine, ...after },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: take + 1,
            select: {
                id: true,
                kind: true,
                actorKind: true,
                actorUserId: true,
                invoiceId: true,
                note: true,
                data: true,
                createdAt: true,
            },
        }),
        prisma.subscriptionEvent.findFirst({
            where: { ...mine, kind: "SUBSCRIBED" },
            select: { id: true },
        }),
    ]);
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const invoiceIds = options.showInvoices
        ? [...new Set(page.flatMap((e) => (e.invoiceId ? [e.invoiceId] : [])))]
        : [];
    const [names, invoices] = await Promise.all([
        teamNames(page),
        invoiceIds.length > 0
            ? prisma.invoice.findMany({
                  where: { organizationId, id: { in: invoiceIds } },
                  select: { id: true, number: true },
              })
            : Promise.resolve([]),
    ]);
    const numbers = new Map(invoices.map((i) => [i.id, i.number]));

    return {
        events: page.map((e) => ({
            id: e.id,
            kind: e.kind as SubscriptionEventKind,
            actor: actorView(
                e.actorKind as EventActorKind,
                e.actorUserId,
                names,
            ),
            // An invoice another business owns, or one gone, isn't named.
            invoice:
                e.invoiceId && numbers.has(e.invoiceId)
                    ? {
                          id: e.invoiceId,
                          number: numbers.get(e.invoiceId) ?? null,
                      }
                    : null,
            note: e.note,
            data: (e.data ?? {}) as SubscriptionEventData,
            createdAt: e.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
        earlierUnrecorded: !started,
    };
}
