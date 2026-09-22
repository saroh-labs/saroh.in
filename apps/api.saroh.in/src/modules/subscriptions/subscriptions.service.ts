import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime, IANAZone } from "luxon";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { contactName } from "../invoices/serialize";
import { fromCents, toCents } from "../invoices/totals";
import { authorize } from "../organizations/organization-policy";
import type {
    CancelSubscriptionDto,
    ListPlansQueryDto,
    ListSubscriptionsQueryDto,
    PlanInputDto,
    SubscribeDto,
} from "./dto";
import type { Interval, Period } from "./periods";
import { periodContaining } from "./periods";
import { SUBSCRIPTION_RENEW_TYPE } from "./renew-job";

type Tx = Prisma.TransactionClient;

const LIST_LIMIT = 500;
const DAY_MS = 86_400_000;

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function notFound(what: string, field?: string): never {
    throw new NotFoundException(
        field
            ? { message: `${what} not found`, details: { field } }
            : `${what} not found`,
    );
}

export interface PlanView {
    id: string;
    name: string;
    description: string | null;
    price: string;
    currency: string;
    interval: Interval;
    status: string;
    /** People on it now — active or paused. */
    subscriberCount: number;
    createdAt: string;
}

export interface SubscriptionView {
    id: string;
    status: string;
    plan: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    price: string;
    currency: string;
    interval: Interval;
    timezone: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    /** When the next invoice is issued; null when nothing will renew. */
    nextRenewalAt: string | null;
    /** When it stops, if it was cancelled to run out at period end. */
    endsAt: string | null;
    pausedAt: string | null;
    cancelledAt: string | null;
    /** Derived from its invoices, never stored: any issued one past due. */
    overdue: boolean;
    /** How many of its issued invoices are past due. */
    overdueCount: number;
    unpaidCount: number;
    unpaidTotal: string;
    oldestUnpaid: {
        id: string;
        number: string | null;
        dueAt: string | null;
    } | null;
    /** The most recent invoice issued for it, paid or not. */
    latestInvoice: {
        id: string;
        number: string | null;
        status: "ISSUED" | "PAID";
        dueAt: string | null;
        paidAt: string | null;
    } | null;
    /**
     * When it began: the start date a member was moved over with, when that
     * is earlier than the day they were added.
     */
    startedAt: string;
    createdAt: string;
}

/** When the renewal job last looked, and what it did today (ADR-007). */
export interface RenewalsView {
    /** The last run that finished, or null if none has yet. */
    lastCheckedAt: string | null;
    /** The run waiting to go, or null if none is scheduled. */
    nextCheckAt: string | null;
    /** Renewal invoices this business issued since midnight, UTC. */
    issuedToday: number;
}

const SUBSCRIPTION_SELECT = {
    id: true,
    organizationId: true,
    status: true,
    planId: true,
    plan: { select: { id: true, name: true } },
    contactId: true,
    contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    price: true,
    currency: true,
    interval: true,
    timezone: true,
    anchorAt: true,
    currentPeriodStart: true,
    currentPeriodEnd: true,
    pausedAt: true,
    cancelAtPeriodEnd: true,
    cancelledAt: true,
    createdAt: true,
} as const;

type SubscriptionRow = Prisma.CustomerSubscriptionGetPayload<{
    select: typeof SUBSCRIPTION_SELECT;
}>;

interface InvoiceRowLite {
    id: string;
    number: string | null;
    status: string;
    subscriptionId: string | null;
    total: { toString(): string };
    dueAt: Date | null;
    paidAt: Date | null;
}

/** A subscription's invoices, as its row needs them. */
interface SubscriptionInvoices {
    /** Issued and unpaid, oldest first. */
    unpaid: InvoiceRowLite[];
    latest: InvoiceRowLite | null;
}

/**
 * What a business sells a person on repeat, and the people on it (ADR-007).
 *
 * Billing is forward only and invoiced each period — nothing is charged. A
 * subscription snapshots its plan's price, currency and interval and a
 * timezone when it starts, so changing the plan never moves anyone's bill.
 *
 * Every change to a subscription — pause, resume, cancel, and the renewal job
 * — takes its row lock first, so a cancel and a renewal cannot interleave:
 * whichever runs second sees what the first did.
 */
@Injectable()
export class SubscriptionsService {
    constructor(private readonly invoices: InvoicesService) {}

    // — Plans ——————————————————————————————————————————————————————

    async listPlans(
        ctx: OrganizationContext,
        query: ListPlansQueryDto,
    ): Promise<PlanView[]> {
        authorize(ctx, "subscription:read");
        const rows = await prisma.subscriptionPlan.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.status ? { status: query.status } : {}),
            },
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            include: {
                _count: {
                    select: {
                        subscriptions: {
                            where: { status: { in: ["ACTIVE", "PAUSED"] } },
                        },
                    },
                },
            },
        });
        return rows.map((r) => this.planView(r));
    }

    async getPlan(ctx: OrganizationContext, id: string): Promise<PlanView> {
        authorize(ctx, "subscription:read");
        return this.readPlan(ctx.organizationId, id);
    }

    async createPlan(
        ctx: OrganizationContext,
        dto: PlanInputDto,
    ): Promise<PlanView> {
        authorize(ctx, "subscription:write");
        if (!dto.name) fieldError("Give the plan a name", "name");
        if (!dto.price) fieldError("Set a price", "price");
        if (!dto.currency) fieldError("Choose a currency", "currency");
        if (!dto.interval) fieldError("Choose how often it renews", "interval");
        const created = await prisma.subscriptionPlan.create({
            data: {
                organizationId: ctx.organizationId,
                name: dto.name,
                description: dto.description ?? null,
                price: fromCents(toCents(dto.price)),
                currency: dto.currency,
                interval: dto.interval,
            },
            select: { id: true },
        });
        return this.readPlan(ctx.organizationId, created.id);
    }

    async updatePlan(
        ctx: OrganizationContext,
        id: string,
        dto: PlanInputDto,
    ): Promise<PlanView> {
        authorize(ctx, "subscription:write");
        await this.readPlan(ctx.organizationId, id);
        await prisma.subscriptionPlan.updateMany({
            where: { id, organizationId: ctx.organizationId },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.description !== undefined
                    ? { description: dto.description }
                    : {}),
                ...(dto.price !== undefined
                    ? { price: fromCents(toCents(dto.price)) }
                    : {}),
                ...(dto.currency !== undefined
                    ? { currency: dto.currency }
                    : {}),
                ...(dto.interval !== undefined
                    ? { interval: dto.interval }
                    : {}),
            },
        });
        return this.readPlan(ctx.organizationId, id);
    }

    /** Archived plans take no new sign-ups; everyone on them carries on. */
    async setPlanStatus(
        ctx: OrganizationContext,
        id: string,
        status: "ACTIVE" | "ARCHIVED",
    ): Promise<PlanView> {
        authorize(ctx, "subscription:write");
        await this.readPlan(ctx.organizationId, id);
        await prisma.subscriptionPlan.updateMany({
            where: { id, organizationId: ctx.organizationId },
            data: { status },
        });
        return this.readPlan(ctx.organizationId, id);
    }

    // — Subscriptions —————————————————————————————————————————————

    async list(
        ctx: OrganizationContext,
        query: ListSubscriptionsQueryDto,
    ): Promise<SubscriptionView[]> {
        authorize(ctx, "subscription:read");
        const rows = await prisma.customerSubscription.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.contactId ? { contactId: query.contactId } : {}),
                ...(query.planId ? { planId: query.planId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: SUBSCRIPTION_SELECT,
        });
        const invoices = await this.invoicesFor(
            ctx.organizationId,
            rows.map((r) => r.id),
        );
        const now = new Date();
        return rows.map((r) => this.view(r, invoices.get(r.id), now));
    }

    async get(ctx: OrganizationContext, id: string): Promise<SubscriptionView> {
        authorize(ctx, "subscription:read");
        return this.read(ctx.organizationId, id);
    }

    /**
     * Put a person on a plan. The current period is the one holding today on
     * the chain that starts at the start date, and only that period is
     * invoiced — a backdated start bills nothing for the months before.
     */
    async subscribe(
        ctx: OrganizationContext,
        dto: SubscribeDto,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        const organizationId = ctx.organizationId;

        const [contact, plan, profile] = await Promise.all([
            prisma.contact.findFirst({
                where: { id: dto.contactId, organizationId },
                select: { id: true },
            }),
            prisma.subscriptionPlan.findFirst({
                where: { id: dto.planId, organizationId },
            }),
            prisma.businessProfile.findUnique({
                where: { organizationId },
                select: { timezone: true },
            }),
        ]);
        if (!contact) notFound("Contact", "contactId");
        if (!plan) notFound("Plan", "planId");
        if (plan.status !== "ACTIVE") {
            fieldError(
                "That plan is archived and takes no new sign-ups",
                "planId",
            );
        }

        // A cleared business timezone is stored as "", which is no zone.
        const timezone =
            [dto.timezone, profile?.timezone].find(Boolean) ?? "UTC";
        if (!IANAZone.isValidZone(timezone)) {
            fieldError("That timezone is not one we know", "timezone");
        }
        const anchor = dto.startDate
            ? DateTime.fromISO(dto.startDate, { zone: timezone })
            : DateTime.now().setZone(timezone).startOf("day");
        if (!anchor.isValid) fieldError("That is not a date", "startDate");

        const interval = plan.interval as Interval;
        const period = periodContaining(
            anchor.toJSDate(),
            interval,
            timezone,
            new Date(),
        );
        const price = toMoneyString(plan.price);

        const id = await prisma.$transaction(async (tx) => {
            const created = await tx.customerSubscription.create({
                data: {
                    organizationId,
                    planId: plan.id,
                    contactId: contact.id,
                    status: "ACTIVE",
                    price,
                    currency: plan.currency,
                    interval,
                    timezone,
                    anchorAt: anchor.toJSDate(),
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            await this.invoicePeriod(tx, {
                organizationId,
                subscriptionId: created.id,
                contactId: contact.id,
                planName: plan.name,
                price,
                currency: plan.currency,
                timezone,
                period,
                createdByUserId: ctx.userId,
            });
            return created.id;
        });
        return this.read(organizationId, id);
    }

    /** Stop renewing until resumed. The period already invoiced is kept. */
    async pause(
        ctx: OrganizationContext,
        id: string,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (sub.status !== "ACTIVE") {
                throw new ConflictException(
                    sub.status === "PAUSED"
                        ? "This subscription is already paused."
                        : "A cancelled subscription cannot be paused.",
                );
            }
            await tx.customerSubscription.update({
                where: { id },
                data: { status: "PAUSED", pausedAt: new Date() },
            });
        });
        return this.read(ctx.organizationId, id);
    }

    /**
     * Carry on after a pause.
     *
     * Paused inside a period already invoiced: that period's end moves later
     * by the whole days paused, and the renewal day moves with it. An undo
     * within the same day therefore changes nothing. Paused past the end of
     * that period: a new period starts today, with its invoice.
     */
    async resume(
        ctx: OrganizationContext,
        id: string,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (sub.status !== "PAUSED" || !sub.pausedAt) {
                throw new ConflictException("This subscription is not paused.");
            }
            const now = new Date();
            const interval = sub.interval as Interval;

            if (now < sub.currentPeriodEnd) {
                const days = Math.floor(
                    (now.getTime() - sub.pausedAt.getTime()) / DAY_MS,
                );
                const end =
                    days > 0
                        ? DateTime.fromJSDate(sub.currentPeriodEnd, {
                              zone: sub.timezone,
                          })
                              .plus({ days })
                              .toJSDate()
                        : sub.currentPeriodEnd;
                await tx.customerSubscription.update({
                    where: { id },
                    data: {
                        status: "ACTIVE",
                        pausedAt: null,
                        currentPeriodEnd: end,
                        // The chain now runs from the new end, so the
                        // renewal after it keeps the same day.
                        ...(days > 0 ? { anchorAt: end } : {}),
                    },
                });
                return;
            }

            const anchor = DateTime.fromJSDate(now, { zone: sub.timezone })
                .startOf("day")
                .toJSDate();
            const period = periodContaining(
                anchor,
                interval,
                sub.timezone,
                now,
            );
            await tx.customerSubscription.update({
                where: { id },
                data: {
                    status: "ACTIVE",
                    pausedAt: null,
                    anchorAt: anchor,
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                },
            });
            await this.invoicePeriod(tx, {
                organizationId: ctx.organizationId,
                subscriptionId: id,
                contactId: sub.contactId,
                planName: sub.plan.name,
                price: toMoneyString(sub.price),
                currency: sub.currency,
                timezone: sub.timezone,
                period,
                createdByUserId: ctx.userId,
            });
        });
        return this.read(ctx.organizationId, id);
    }

    async cancel(
        ctx: OrganizationContext,
        id: string,
        dto: CancelSubscriptionDto,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (sub.status === "CANCELLED") {
                throw new ConflictException(
                    "This subscription is already cancelled.",
                );
            }
            // A paused subscription has nothing running to let run out.
            if (dto.when === "now" || sub.status === "PAUSED") {
                await tx.customerSubscription.update({
                    where: { id },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: new Date(),
                        cancelAtPeriodEnd: false,
                    },
                });
                return;
            }
            await tx.customerSubscription.update({
                where: { id },
                data: { cancelAtPeriodEnd: true },
            });
        });
        return this.read(ctx.organizationId, id);
    }

    /** Take back a cancel-at-period-end before the period runs out. */
    async keep(
        ctx: OrganizationContext,
        id: string,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (sub.status === "CANCELLED" || !sub.cancelAtPeriodEnd) {
                throw new ConflictException(
                    "This subscription is not set to end.",
                );
            }
            await tx.customerSubscription.update({
                where: { id },
                data: { cancelAtPeriodEnd: false },
            });
        });
        return this.read(ctx.organizationId, id);
    }

    /**
     * When the renewal job last ran and will next run, and how many renewal
     * invoices went out today. There is no scheduler to look at, so the
     * screen says this rather than leaving silence that reads the same as a
     * stopped job. The run times are the job's, shared by every business.
     */
    async renewals(ctx: OrganizationContext): Promise<RenewalsView> {
        authorize(ctx, "subscription:read");
        const midnight = new Date();
        midnight.setUTCHours(0, 0, 0, 0);
        const [last, next, issuedToday] = await Promise.all([
            prisma.job.findFirst({
                where: { type: SUBSCRIPTION_RENEW_TYPE, status: "DONE" },
                orderBy: { processedAt: "desc" },
                select: { processedAt: true },
            }),
            prisma.job.findFirst({
                where: { type: SUBSCRIPTION_RENEW_TYPE, status: "PENDING" },
                orderBy: { runAt: "asc" },
                select: { runAt: true },
            }),
            prisma.invoice.count({
                where: {
                    organizationId: ctx.organizationId,
                    source: "SUBSCRIPTION",
                    createdByUserId: null,
                    issuedAt: { gte: midnight },
                },
            }),
        ]);
        return {
            lastCheckedAt: last?.processedAt?.toISOString() ?? null,
            nextCheckAt: next?.runAt.toISOString() ?? null,
            issuedToday,
        };
    }

    // — Renewal (called by the job) ————————————————————————————————

    /**
     * Renew one subscription if it is due, in its own transaction under its
     * row lock. Forward only: it moves to the period holding `now` and
     * invoices that one, however many were missed.
     *
     * Returns what it did, for the job's log. A period that already has a
     * live invoice is advanced without issuing another.
     */
    async renewOne(
        id: string,
        now: Date,
    ): Promise<"renewed" | "advanced" | "ended" | "skipped"> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${id} FOR UPDATE`;
            const sub = await tx.customerSubscription.findUnique({
                where: { id },
                select: SUBSCRIPTION_SELECT,
            });
            if (sub?.status !== "ACTIVE" || sub.currentPeriodEnd > now) {
                return "skipped";
            }
            if (sub.cancelAtPeriodEnd) {
                await tx.customerSubscription.update({
                    where: { id },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: sub.currentPeriodEnd,
                        cancelAtPeriodEnd: false,
                    },
                });
                return "ended";
            }

            const period = periodContaining(
                sub.anchorAt,
                sub.interval as Interval,
                sub.timezone,
                now,
            );
            await tx.customerSubscription.update({
                where: { id },
                data: {
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                },
            });
            const live = await tx.invoice.findFirst({
                where: {
                    subscriptionId: id,
                    periodStart: period.start,
                    status: { not: "VOID" },
                },
                select: { id: true },
            });
            if (live) return "advanced";

            await this.invoicePeriod(tx, {
                organizationId: sub.organizationId,
                subscriptionId: id,
                contactId: sub.contactId,
                planName: sub.plan.name,
                price: toMoneyString(sub.price),
                currency: sub.currency,
                timezone: sub.timezone,
                period,
                createdByUserId: null,
            });
            return "renewed";
        });
    }

    // — internals —————————————————————————————————————————————————

    private async invoicePeriod(
        tx: Tx,
        input: {
            organizationId: string;
            subscriptionId: string;
            contactId: string;
            planName: string;
            price: string;
            currency: string;
            timezone: string;
            period: Period;
            createdByUserId: string | null;
        },
    ): Promise<void> {
        await this.invoices.issueInTx(tx, input.organizationId, {
            contactId: input.contactId,
            currency: input.currency,
            lines: [
                {
                    description: `${input.planName} · ${periodLabel(input.period, input.timezone)}`,
                    quantity: 1,
                    unitPrice: input.price,
                },
            ],
            source: "SUBSCRIPTION",
            subscriptionId: input.subscriptionId,
            periodStart: input.period.start,
            periodEnd: input.period.end,
            createdByUserId: input.createdByUserId,
        });
    }

    /** Take the row lock, then read it — scoped to the business. */
    private async lock(
        tx: Tx,
        organizationId: string,
        id: string,
    ): Promise<SubscriptionRow> {
        await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
        const sub = await tx.customerSubscription.findFirst({
            where: { id, organizationId },
            select: SUBSCRIPTION_SELECT,
        });
        if (!sub) notFound("Subscription");
        return sub;
    }

    private async read(
        organizationId: string,
        id: string,
    ): Promise<SubscriptionView> {
        const row = await prisma.customerSubscription.findFirst({
            where: { id, organizationId },
            select: SUBSCRIPTION_SELECT,
        });
        if (!row) notFound("Subscription");
        const invoices = await this.invoicesFor(organizationId, [id]);
        return this.view(row, invoices.get(id), new Date());
    }

    private async readPlan(
        organizationId: string,
        id: string,
    ): Promise<PlanView> {
        const row = await prisma.subscriptionPlan.findFirst({
            where: { id, organizationId },
            include: {
                _count: {
                    select: {
                        subscriptions: {
                            where: { status: { in: ["ACTIVE", "PAUSED"] } },
                        },
                    },
                },
            },
        });
        if (!row) notFound("Plan");
        return this.planView(row);
    }

    /**
     * Each subscription's issued and paid invoices in one read: the unpaid
     * ones, oldest first, and the latest of them all.
     */
    private async invoicesFor(
        organizationId: string,
        subscriptionIds: string[],
    ): Promise<Map<string, SubscriptionInvoices>> {
        const byId = new Map<string, SubscriptionInvoices>();
        if (subscriptionIds.length === 0) return byId;
        const rows: InvoiceRowLite[] = await prisma.invoice.findMany({
            where: {
                organizationId,
                status: { in: ["ISSUED", "PAID"] },
                subscriptionId: { in: subscriptionIds },
            },
            orderBy: { issuedAt: "asc" },
            select: {
                id: true,
                number: true,
                status: true,
                subscriptionId: true,
                total: true,
                dueAt: true,
                paidAt: true,
            },
        });
        for (const r of rows) {
            if (!r.subscriptionId) continue;
            const entry = byId.get(r.subscriptionId) ?? {
                unpaid: [],
                latest: null,
            };
            if (r.status === "ISSUED") entry.unpaid.push(r);
            entry.latest = r;
            byId.set(r.subscriptionId, entry);
        }
        return byId;
    }

    private view(
        row: SubscriptionRow,
        invoices: SubscriptionInvoices | undefined,
        now: Date,
    ): SubscriptionView {
        const unpaid = invoices?.unpaid ?? [];
        const latest = invoices?.latest ?? null;
        const pastDue = unpaid.filter(
            (u) => u.dueAt !== null && u.dueAt < now,
        ).length;
        const renews = row.status === "ACTIVE" && !row.cancelAtPeriodEnd;
        const oldest = unpaid.length > 0 ? unpaid[0] : null;
        return {
            id: row.id,
            status: row.status,
            plan: row.plan,
            contact: {
                id: row.contact.id,
                name: contactName(row.contact),
                email: row.contact.email,
            },
            price: toMoneyString(row.price),
            currency: row.currency,
            interval: row.interval as Interval,
            timezone: row.timezone,
            currentPeriodStart: row.currentPeriodStart.toISOString(),
            currentPeriodEnd: row.currentPeriodEnd.toISOString(),
            nextRenewalAt: renews ? row.currentPeriodEnd.toISOString() : null,
            endsAt:
                row.status === "ACTIVE" && row.cancelAtPeriodEnd
                    ? row.currentPeriodEnd.toISOString()
                    : null,
            pausedAt: row.pausedAt?.toISOString() ?? null,
            cancelledAt: row.cancelledAt?.toISOString() ?? null,
            overdue: pastDue > 0,
            overdueCount: pastDue,
            unpaidCount: unpaid.length,
            unpaidTotal: fromCents(
                unpaid.reduce((sum, u) => sum + toCents(u.total.toString()), 0),
            ),
            oldestUnpaid: oldest
                ? {
                      id: oldest.id,
                      number: oldest.number,
                      dueAt: oldest.dueAt?.toISOString() ?? null,
                  }
                : null,
            latestInvoice: latest
                ? {
                      id: latest.id,
                      number: latest.number,
                      status: latest.status === "PAID" ? "PAID" : "ISSUED",
                      dueAt: latest.dueAt?.toISOString() ?? null,
                      paidAt: latest.paidAt?.toISOString() ?? null,
                  }
                : null,
            // A resume re-anchors a subscription later, so the anchor is
            // its start only while it is the earlier of the two.
            startedAt: (row.anchorAt < row.createdAt
                ? row.anchorAt
                : row.createdAt
            ).toISOString(),
            createdAt: row.createdAt.toISOString(),
        };
    }

    private planView(row: {
        id: string;
        name: string;
        description: string | null;
        price: { toString(): string };
        currency: string;
        interval: string;
        status: string;
        createdAt: Date;
        _count: { subscriptions: number };
    }): PlanView {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            price: toMoneyString(row.price),
            currency: row.currency,
            interval: row.interval as Interval,
            status: row.status,
            subscriberCount: row._count.subscriptions,
            createdAt: row.createdAt.toISOString(),
        };
    }
}

/** "1 Sep – 30 Sep 2026": the last day shown is the day before the end. */
export function periodLabel(period: Period, timezone: string): string {
    const start = DateTime.fromJSDate(period.start, { zone: timezone });
    const last = DateTime.fromJSDate(period.end, { zone: timezone }).minus({
        days: 1,
    });
    const sameYear = start.year === last.year;
    return `${start.toFormat(sameYear ? "d LLL" : "d LLL yyyy")} – ${last.toFormat("d LLL yyyy")}`;
}
