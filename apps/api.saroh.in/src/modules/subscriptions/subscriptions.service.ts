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
import { resolveContact } from "../customer-workspace/resolve-contact";
import { isPastDue } from "../invoices/invoice-state";
import { InvoicesService } from "../invoices/invoices.service";
import { assertPaymentsOn, paymentsOn } from "../invoices/payments-on";
import { contactName } from "../invoices/serialize";
import { fromCents, toCents } from "../invoices/totals";
import { allows, authorize } from "../organizations/organization-policy";
import { cancelMandatesInTx } from "../payments/mandate-cancel-job";
import { allowanceData } from "./classes-allowance";
import type { UpcomingCollection } from "./collections";
import {
    collectionDates,
    collectionToCome,
    dateKey,
    dateValue,
    everyCollectionSkipped,
    isoDay,
    localDate,
    upcomingCollections,
} from "./collections";
import type {
    CancelSubscriptionDto,
    ChangePlanDto,
    CollectionScheduleDto,
    ListPlanEventsQueryDto,
    ListPlansQueryDto,
    ListSubscriptionEventsQueryDto,
    ListSubscriptionsQueryDto,
    PauseSubscriptionDto,
    PauseWeeks,
    PlanDraftDto,
    PlanInputDto,
    SkipCollectionDto,
    SubscribeDto,
    SubscriptionSettingsDto,
} from "./dto";
import { overdueInvoiceOf, takesPaymentOnline } from "./member-invoices";
import type { PauseEnded } from "./pause-until";
import {
    pausedEventData,
    pauseEnd,
    pauseHasEnded,
    resumeWhenDue,
} from "./pause-until";
import type { Interval, Period } from "./periods";
import { periodContaining } from "./periods";
import type { PlanEditorView } from "./plan-draft-view";
import { readPlanEditor } from "./plan-draft-view";
import {
    createPlanDraft,
    deletePlanDraft,
    discardPlanChanges,
    publishPlan,
    savePlanDraft,
} from "./plan-drafts";
import type { PlanEventsPage } from "./plan-events";
import { listPlanEvents, planActor } from "./plan-events";
import { assertPlanOnSale, PLAN_DRAFT } from "./plan-on-sale";
import { createPlanRow, setPlanStatusRow, updatePlanRow } from "./plan-writes";
import type { PlanView } from "./plans";
import { planViews, readPlan } from "./plans";
import { SUBSCRIPTION_RENEW_TYPE } from "./renew-job";
import type {
    EventPlanRef,
    SubscriptionEventLog,
    SubscriptionEventsPage,
} from "./subscription-events";
import {
    collectionChanges,
    customerActor,
    JOB,
    listSubscriptionEvents,
    subscriptionActor,
    subscriptionEventLog,
} from "./subscription-events";
import type { SubscriptionSettingsView } from "./subscription-settings";
import {
    readSubscriptionSettings,
    writeSubscriptionSettings,
} from "./subscription-settings";

type Tx = Prisma.TransactionClient;

const LIST_LIMIT = 500;

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

/**
 * Someone who may see subscriptions but not invoices still sees what each
 * owes — that is the subscription's standing — but not which invoices, whose
 * pages they could not open anyway.
 */
function forViewer(
    ctx: OrganizationContext,
    view: SubscriptionView,
): SubscriptionView {
    if (allows(ctx, "invoice:read")) return view;
    return {
        ...view,
        oldestUnpaid: null,
        latestInvoice: null,
        failedCharge: null,
    };
}

/** A blank note is no note. */
function orNull(value: string | null | undefined): string | null {
    return value && value.length > 0 ? value : null;
}

/** A refusal about one collection date: 409 with the field it is about. */
function dateConflict(message: string): never {
    throw new ConflictException({ message, details: { field: "date" } });
}

/** One live subscription per person per plan (the partial unique index). */
function alreadyOn(planName: string): never {
    throw new ConflictException(
        `They are already on ${planName}. Resume or change that subscription instead.`,
    );
}

function notFound(what: string, field?: string): never {
    throw new NotFoundException(
        field
            ? { message: `${what} not found`, details: { field } }
            : `${what} not found`,
    );
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
    /** A start still ahead: nothing is billed until then. */
    startsAt: string | null;
    /** When it stops, if it was cancelled to run out at period end. */
    endsAt: string | null;
    pausedAt: string | null;
    /** When a pause resumes on its own (D8); null while it runs until resumed. */
    pausedUntil: string | null;
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
     * Payment failed: the latest charge is unpaid and past due. Derived from
     * that invoice, never stored; a cancelled subscription has none.
     */
    paymentFailed: boolean;
    /** That charge — hidden, like every invoice id, without `invoice:read`. */
    failedCharge: {
        id: string;
        number: string | null;
        dueAt: string | null;
        total: string;
    } | null;
    /** The collection schedule, or null when nothing is collected. */
    collection: {
        /** ISO weekday: 1 Monday … 7 Sunday, in the subscription's timezone. */
        weekday: number;
        note: string | null;
        /** The next collections, skipped ones included and marked. */
        upcoming: UpcomingCollection[];
    } | null;
    /** A plan change booked for the next renewal, or null. */
    pendingPlan: {
        id: string;
        name: string;
        price: string;
        currency: string;
        interval: Interval;
        /** When it takes effect: the next renewal, or a resume after the paid period. */
        from: string;
    } | null;
    /**
     * When it began: the start date a member was moved over with, when that
     * is earlier than the day they were added.
     */
    startedAt: string;
    createdAt: string;
}

/**
 * A member acting on their own subscription from their account on the
 * business's site (round-2 A8): the business, their contact, and the site
 * account that acted, as `CustomerSessionGuard` resolved them.
 */
export interface CustomerScope {
    organizationId: string;
    contactId: string;
    accountId: string;
}

/** What the renewal job did to one subscription, for its run's log. */
export type RenewOutcome =
    | "renewed"
    | "advanced"
    | "uncharged"
    | "ended"
    | "skipped"
    // A pause with an end date (D8): resumed, or left paused with Payments off.
    | "resumed"
    | "refused";

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
    // Its classes a month, taken at each renewal (D10).
    plan: { select: { id: true, name: true, classesPerMonth: true } },
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
    collectionWeekday: true,
    collectionNote: true,
    pendingPlanId: true,
    pausedUntil: true,
    pendingPlan: {
        select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            interval: true,
            classesPerMonth: true,
        },
    },
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

/** What a period is billed at: the subscription's terms, or its new plan's. */
interface Terms {
    planId: string;
    planName: string;
    price: string;
    currency: string;
    interval: Interval;
    /** The plan's classes a month, which the period takes (D10). */
    classesPerMonth: number | null;
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
        // Drafts only when asked for (D5): an app before the Plan Editor
        // lists plans without a filter and would draw a draft as live.
        const where: Prisma.SubscriptionPlanWhereInput = query.status
            ? { status: query.status }
            : query.include === "drafts"
              ? {}
              : { status: { not: PLAN_DRAFT } };
        return planViews(ctx.organizationId, where);
    }

    async getPlan(ctx: OrganizationContext, id: string): Promise<PlanView> {
        authorize(ctx, "subscription:read");
        return readPlan(ctx.organizationId, id);
    }

    async createPlan(
        ctx: OrganizationContext,
        dto: PlanInputDto,
    ): Promise<PlanView> {
        authorize(ctx, "subscription:write");
        const id = await createPlanRow(ctx.organizationId, planActor(ctx), dto);
        return readPlan(ctx.organizationId, id);
    }

    async updatePlan(
        ctx: OrganizationContext,
        id: string,
        dto: PlanInputDto,
    ): Promise<PlanView> {
        authorize(ctx, "subscription:write");
        await updatePlanRow(ctx.organizationId, planActor(ctx), id, dto);
        return readPlan(ctx.organizationId, id);
    }

    /** Archive a plan, or sell it again (`plan-writes.ts` says the rules). */
    async setPlanStatus(
        ctx: OrganizationContext,
        id: string,
        status: "ACTIVE" | "ARCHIVED",
    ): Promise<PlanView> {
        authorize(ctx, "subscription:write");
        await setPlanStatusRow(ctx.organizationId, planActor(ctx), id, status);
        return readPlan(ctx.organizationId, id);
    }

    // — Plan drafts (D5): the Plan Editor's read and writes ———————————

    /** A plan as the editor reads it: values, what's live, the revision. */
    async getPlanEditor(
        ctx: OrganizationContext,
        id: string,
    ): Promise<PlanEditorView> {
        authorize(ctx, "subscription:read");
        return readPlanEditor(ctx.organizationId, id);
    }

    /** The editor's first save of a new plan: a DRAFT nobody can buy. */
    async createPlanDraft(
        ctx: OrganizationContext,
        dto: PlanInputDto,
    ): Promise<PlanEditorView> {
        authorize(ctx, "subscription:write");
        const id = await createPlanDraft(
            ctx.organizationId,
            planActor(ctx),
            dto,
        );
        return readPlanEditor(ctx.organizationId, id);
    }

    /** Autosave: a draft's fields, or a live plan's unpublished changes. */
    async savePlanDraft(
        ctx: OrganizationContext,
        id: string,
        dto: PlanDraftDto,
    ): Promise<PlanEditorView> {
        authorize(ctx, "subscription:write");
        await savePlanDraft(ctx.organizationId, planActor(ctx), id, dto);
        return readPlanEditor(ctx.organizationId, id);
    }

    /** Put a draft on sale, or make a live plan's changes its terms. */
    async publishPlan(
        ctx: OrganizationContext,
        id: string,
        revision: number,
    ): Promise<PlanEditorView> {
        authorize(ctx, "subscription:write");
        await publishPlan(ctx.organizationId, planActor(ctx), id, revision);
        return readPlanEditor(ctx.organizationId, id);
    }

    /** Drop a live plan's unpublished changes. */
    async discardPlanChanges(
        ctx: OrganizationContext,
        id: string,
        revision: number,
    ): Promise<PlanEditorView> {
        authorize(ctx, "subscription:write");
        await discardPlanChanges(
            ctx.organizationId,
            planActor(ctx),
            id,
            revision,
        );
        return readPlanEditor(ctx.organizationId, id);
    }

    /** Delete a draft nobody has bought. */
    async deletePlanDraft(
        ctx: OrganizationContext,
        id: string,
        revision: number,
    ): Promise<void> {
        authorize(ctx, "subscription:write");
        await deletePlanDraft(ctx.organizationId, id, revision);
    }

    /** A plan's history, newest first (D2). */
    async planEvents(
        ctx: OrganizationContext,
        id: string,
        query: ListPlanEventsQueryDto,
    ): Promise<PlanEventsPage> {
        authorize(ctx, "subscription:read");
        return listPlanEvents(ctx.organizationId, id, query);
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
        const ids = rows.map((r) => r.id);
        const [invoices, skips] = await Promise.all([
            this.invoicesFor(ctx.organizationId, ids),
            this.skipsFor(ctx.organizationId, ids),
        ]);
        const now = new Date();
        return rows.map((r) =>
            forViewer(
                ctx,
                this.view(r, invoices.get(r.id), skips.get(r.id), now),
            ),
        );
    }

    async get(ctx: OrganizationContext, id: string): Promise<SubscriptionView> {
        authorize(ctx, "subscription:read");
        return this.read(ctx, id);
    }

    /** What was done to it and by whom, newest first (D9). */
    async events(
        ctx: OrganizationContext,
        id: string,
        query: ListSubscriptionEventsQueryDto,
    ): Promise<SubscriptionEventsPage> {
        authorize(ctx, "subscription:read");
        return listSubscriptionEvents(ctx.organizationId, id, {
            ...query,
            showInvoices: allows(ctx, "invoice:read"),
        });
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
        // A draft isn't published yet; an archived plan takes no one new.
        assertPlanOnSale(plan);

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
        // A start still ahead bills nothing yet. Its period is empty and ends
        // at the start, so the renewal job issues the first invoice on the
        // day — not today, due before they have begun.
        const now = new Date();
        const startsLater = anchor.toJSDate() > now;
        const period = startsLater
            ? { start: anchor.toJSDate(), end: anchor.toJSDate() }
            : periodContaining(anchor.toJSDate(), interval, timezone, now);
        const price = toMoneyString(plan.price);

        const live = await prisma.customerSubscription.count({
            where: {
                organizationId,
                planId: plan.id,
                contactId: contact.id,
                status: { in: ["ACTIVE", "PAUSED"] },
            },
        });
        if (live > 0) alreadyOn(plan.name);

        const id = await prisma
            .$transaction(async (tx) => {
                await assertPaymentsOn(tx, organizationId, "subscribe people");
                // Merged since the page loaded (C9)? Subscribe the survivor.
                const person = await resolveContact(
                    tx,
                    contact.id,
                    organizationId,
                );
                if (!person || person.removed) notFound("Contact", "contactId");
                const created = await tx.customerSubscription.create({
                    data: {
                        organizationId,
                        planId: plan.id,
                        contactId: person.id,
                        status: "ACTIVE",
                        price,
                        currency: plan.currency,
                        interval,
                        timezone,
                        anchorAt: anchor.toJSDate(),
                        currentPeriodStart: period.start,
                        currentPeriodEnd: period.end,
                        collectionWeekday: dto.collectionWeekday ?? null,
                        collectionNote: orNull(dto.collectionNote),
                        createdByUserId: ctx.userId,
                        // The plan's classes a month, until the next
                        // renewal takes them again (D10).
                        ...allowanceData(plan.classesPerMonth, now),
                    },
                    select: { id: true },
                });
                let invoiceId: string | null = null;
                if (!startsLater) {
                    invoiceId = await this.invoicePeriod(tx, {
                        organizationId,
                        subscriptionId: created.id,
                        contactId: person.id,
                        planName: plan.name,
                        price,
                        currency: plan.currency,
                        timezone,
                        period,
                        createdByUserId: ctx.userId,
                    });
                }
                await subscriptionEventLog(
                    tx,
                    organizationId,
                    created.id,
                    subscriptionActor(ctx),
                )("SUBSCRIBED", {
                    invoiceId,
                    data: {
                        plan: planRef({ ...plan, price }),
                        startsAt: startsLater
                            ? period.start.toISOString()
                            : null,
                    },
                });
                return created.id;
            })
            .catch((err: unknown) => {
                // The same subscribe, twice at once: the index lets one through.
                if ((err as { code?: string }).code === "P2002") {
                    alreadyOn(plan.name);
                }
                throw err;
            });
        return this.read(ctx, id);
    }

    /**
     * Stop renewing until resumed, or until an end date when it resumes on
     * its own (D8). The period already invoiced is kept.
     */
    async pause(
        ctx: OrganizationContext,
        id: string,
        dto: PauseSubscriptionDto = {},
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            await this.pauseLocked(tx, sub, dto, this.log(tx, ctx, id));
        });
        return this.read(ctx, id);
    }

    /**
     * A member pausing their own plan from their account (round-2 A8): for
     * a number of weeks only, so it always has an end date — "until I
     * resume" stays a staff choice (D8). Found by id **and** the member's
     * contact: anyone else's is a 404. Whether the business lets members
     * pause is the caller's check (`account-plan.service.ts`).
     */
    async pauseForCustomer(
        member: CustomerScope,
        id: string,
        weeks: PauseWeeks,
    ): Promise<{ pausedUntil: Date | null; timezone: string }> {
        return prisma.$transaction(async (tx) => {
            const sub = await this.lock(
                tx,
                member.organizationId,
                id,
                member.contactId,
            );
            const pausedUntil = await this.pauseLocked(
                tx,
                sub,
                { weeks },
                this.customerLog(tx, member, id),
            );
            return { pausedUntil, timezone: sub.timezone };
        });
    }

    private async pauseLocked(
        tx: Tx,
        sub: SubscriptionRow,
        dto: PauseSubscriptionDto,
        log: SubscriptionEventLog,
    ): Promise<Date | null> {
        if (sub.status !== "ACTIVE") {
            throw new ConflictException(
                sub.status === "PAUSED"
                    ? "This subscription is already paused."
                    : "A cancelled subscription cannot be paused.",
            );
        }
        const now = new Date();
        const pausedUntil = pauseEnd(dto, now, sub.timezone);
        await tx.customerSubscription.update({
            where: { id: sub.id },
            data: { status: "PAUSED", pausedAt: now, pausedUntil },
        });
        await log("PAUSED", { data: pausedEventData(pausedUntil) });
        return pausedUntil;
    }

    /**
     * Carry on after a pause, by hand. The job's resume at a pause's end
     * date (D8) runs the same code: see {@link resumeLocked}.
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
            await this.resumeLocked(tx, sub, this.log(tx, ctx, id), {
                now: new Date(),
                createdByUserId: ctx.userId,
            });
        });
        return this.read(ctx, id);
    }

    /**
     * A member resuming their own paused plan from their account (A8), by
     * the same code as a resume by hand. Found by id and the member's
     * contact. A restart past the paid period bills, so with Payments off
     * it is refused in the member's words rather than the team's.
     */
    async resumeForCustomer(
        member: CustomerScope,
        id: string,
    ): Promise<{ restarted: boolean; renewsAt: Date; timezone: string }> {
        return prisma.$transaction(async (tx) => {
            const sub = await this.lock(
                tx,
                member.organizationId,
                id,
                member.contactId,
            );
            if (sub.status !== "PAUSED" || !sub.pausedAt) {
                throw new ConflictException("This plan isn't paused.");
            }
            const now = new Date();
            const restarts =
                now >= sub.currentPeriodEnd && !sub.cancelAtPeriodEnd;
            if (restarts && !(await paymentsOn(tx, sub.organizationId))) {
                throw new ConflictException(
                    "Your plan can't restart online just now. Ask the business to restart it for you.",
                );
            }
            await this.resumeLocked(tx, sub, this.customerLog(tx, member, id), {
                now,
                createdByUserId: null,
            });
            const after = await tx.customerSubscription.findFirstOrThrow({
                where: { id, organizationId: member.organizationId },
                select: { currentPeriodEnd: true },
            });
            return {
                restarted: restarts,
                renewsAt: after.currentPeriodEnd,
                timezone: sub.timezone,
            };
        });
    }

    /**
     * Resume a paused subscription whose row lock the caller holds.
     *
     * Paused inside a period already invoiced: that period's end moves later
     * by the whole days paused, and the renewal day moves with it. An undo
     * within the same day therefore changes nothing. Paused past the end of
     * that period: a new period starts today, with its invoice.
     *
     * A resume by hand decides from now. A pause's end date (D8) passes
     * `ended`, which decides from the dates instead, so a late run lands
     * where an on-time one would: `days` is how many calendar days the
     * pause took, `extends` whether its end came on or before the period's
     * end, and `on` the day a restart's new period starts.
     */
    private async resumeLocked(
        tx: Tx,
        sub: SubscriptionRow,
        log: SubscriptionEventLog,
        opts: {
            now: Date;
            createdByUserId: string | null;
            ended?: PauseEnded;
        },
    ): Promise<void> {
        const { id } = sub;
        const { now, ended } = opts;
        const pausedAt = sub.pausedAt ?? now;
        // A resume, by hand or on its own, ends the pause and its end date.
        const resumed = { pausedAt: null, pausedUntil: null };

        if (ended ? ended.extends : now < sub.currentPeriodEnd) {
            // Calendar days in its own zone, so a pause across a clock
            // change is not a day short.
            const days =
                ended?.days ??
                Math.floor(
                    DateTime.fromJSDate(now, { zone: sub.timezone }).diff(
                        DateTime.fromJSDate(pausedAt, {
                            zone: sub.timezone,
                        }),
                        "days",
                    ).days,
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
                    ...resumed,
                    currentPeriodEnd: end,
                    // The chain now runs from the new end, so the
                    // renewal after it keeps the same day.
                    ...(days > 0 ? { anchorAt: end } : {}),
                },
            });
            await log("RESUMED", {
                data: { extendedDays: Math.max(days, 0) },
            });
            return;
        }

        // Set to end with that period: it has ended, and nothing more
        // is billed.
        if (sub.cancelAtPeriodEnd) {
            await tx.customerSubscription.update({
                where: { id },
                data: {
                    status: "CANCELLED",
                    ...resumed,
                    cancelledAt: sub.currentPeriodEnd,
                    cancelAtPeriodEnd: false,
                },
            });
            await log("ENDED", {
                data: { at: sub.currentPeriodEnd.toISOString() },
            });
            await endMandates(tx, sub.organizationId, id);
            return;
        }

        await assertPaymentsOn(
            tx,
            sub.organizationId,
            "restart a subscription past its paid period",
        );
        // A new period starts today: that is the next renewal, so a plan
        // change booked for it takes effect here.
        const terms = await this.nextTerms(tx, sub);
        const anchor = DateTime.fromJSDate(ended?.on ?? now, {
            zone: sub.timezone,
        })
            .startOf("day")
            .toJSDate();
        const period = periodContaining(
            anchor,
            terms.interval,
            sub.timezone,
            now,
        );
        await tx.customerSubscription.update({
            where: { id },
            data: {
                status: "ACTIVE",
                ...resumed,
                anchorAt: anchor,
                currentPeriodStart: period.start,
                currentPeriodEnd: period.end,
                ...this.termsData(sub, terms),
                // A new period is a renewal: it takes the classes too (D10).
                ...allowanceData(terms.classesPerMonth, now),
            },
        });
        await this.logPlanChanged(log, sub, terms);
        const invoiceId = await this.invoicePeriod(tx, {
            organizationId: sub.organizationId,
            subscriptionId: id,
            contactId: sub.contactId,
            planName: terms.planName,
            price: terms.price,
            currency: terms.currency,
            timezone: sub.timezone,
            period,
            createdByUserId: opts.createdByUserId,
        });
        await log("RESUMED", { invoiceId, data: { restarted: true } });
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
                        // Nothing renews, so no change is waiting for it.
                        pendingPlanId: null,
                    },
                });
                await this.log(tx, ctx, id)("CANCELLED");
                await endMandates(tx, ctx.organizationId, id);
                return;
            }
            // A booked plan change is kept, so Keep (the undo) restores it.
            await tx.customerSubscription.update({
                where: { id },
                data: { cancelAtPeriodEnd: true },
            });
            await this.log(
                tx,
                ctx,
                id,
            )("CANCEL_SCHEDULED", {
                data: { endsAt: sub.currentPeriodEnd.toISOString() },
            });
        });
        return this.read(ctx, id);
    }

    /**
     * A member cancelling their own plan from their account (A8): at the
     * end of the period, never today, so they keep what they paid for. A
     * paused plan has nothing running to let run out, so it stops now, as
     * a team member's cancel does. A plan already set to end changes
     * nothing and records nothing: `already`.
     */
    async cancelForCustomer(
        member: CustomerScope,
        id: string,
    ): Promise<{
        outcome: "scheduled" | "already" | "now";
        endsAt: Date;
        timezone: string;
    }> {
        return prisma.$transaction(async (tx) => {
            const sub = await this.lock(
                tx,
                member.organizationId,
                id,
                member.contactId,
            );
            const said = {
                endsAt: sub.currentPeriodEnd,
                timezone: sub.timezone,
            };
            if (sub.status === "CANCELLED") {
                throw new ConflictException("This plan has already ended.");
            }
            if (sub.status === "ACTIVE" && sub.cancelAtPeriodEnd) {
                return { outcome: "already", ...said };
            }
            const log = this.customerLog(tx, member, id);
            if (sub.status === "PAUSED") {
                const now = new Date();
                await tx.customerSubscription.update({
                    where: { id },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: now,
                        cancelAtPeriodEnd: false,
                        pendingPlanId: null,
                    },
                });
                await log("CANCELLED");
                await endMandates(tx, member.organizationId, id);
                return { outcome: "now", endsAt: now, timezone: sub.timezone };
            }
            await tx.customerSubscription.update({
                where: { id },
                data: { cancelAtPeriodEnd: true },
            });
            await log("CANCEL_SCHEDULED", {
                data: { endsAt: sub.currentPeriodEnd.toISOString() },
            });
            return { outcome: "scheduled", ...said };
        });
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
            await this.log(tx, ctx, id)("KEPT");
        });
        return this.read(ctx, id);
    }

    // — Collections, plan changes, a failed charge (U7) ————————————————

    /**
     * Set or stop the collection schedule. A new day drops the skips still to
     * come — they were for the old day — and keeps the ones already past.
     * When the old day's skips had left the current period uncharged and the
     * new day gives it a collection, the period is invoiced now, as its
     * renewal would have.
     */
    async setCollection(
        ctx: OrganizationContext,
        id: string,
        dto: CollectionScheduleDto,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (sub.status === "CANCELLED") {
                throw new ConflictException(
                    "A cancelled subscription has no collections.",
                );
            }
            if (dto.weekday !== sub.collectionWeekday) {
                const today = localDate(new Date(), sub.timezone);
                await tx.subscriptionSkip.deleteMany({
                    where: {
                        subscriptionId: id,
                        date: { gt: dateValue(today) },
                    },
                });
            }
            const note =
                dto.weekday === null
                    ? null
                    : dto.note !== undefined
                      ? orNull(dto.note)
                      : sub.collectionNote;
            await tx.customerSubscription.update({
                where: { id },
                data: {
                    collectionWeekday: dto.weekday,
                    ...(note !== sub.collectionNote
                        ? { collectionNote: note }
                        : {}),
                },
            });
            const log = this.log(tx, ctx, id);
            const changes = collectionChanges(
                { weekday: sub.collectionWeekday, note: sub.collectionNote },
                { weekday: dto.weekday, note },
            );
            if (Object.keys(changes).length > 0) {
                await log("COLLECTION_CHANGED", { data: changes });
            }
            if (dto.weekday !== sub.collectionWeekday) {
                await this.chargeIfUncharged(tx, ctx, log, {
                    ...sub,
                    collectionWeekday: dto.weekday,
                });
            }
        });
        return this.read(ctx, id);
    }

    /**
     * Skip one collection still to come. The charge follows the rule in
     * `collections.ts`: a period is not charged only when every one of its
     * collections was skipped before it was invoiced.
     */
    async skipCollection(
        ctx: OrganizationContext,
        id: string,
        dto: SkipCollectionDto,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma
            .$transaction(async (tx) => {
                const sub = await this.lock(tx, ctx.organizationId, id);
                this.assertCollects(sub);
                const date = this.collectionDate(sub, dto.date);
                const today = localDate(new Date(), sub.timezone);
                if (date <= today) {
                    fieldError(
                        "Only a collection still to come can be skipped",
                        "date",
                    );
                }
                const yearOut = isoDay(
                    DateTime.fromISO(today, { zone: "UTC" }).plus({ years: 1 }),
                );
                if (date > yearOut) {
                    fieldError(
                        "That collection is more than a year away",
                        "date",
                    );
                }
                if (date < localDate(sub.currentPeriodStart, sub.timezone)) {
                    fieldError(
                        "The subscription has not started by then",
                        "date",
                    );
                }
                if (
                    sub.cancelAtPeriodEnd &&
                    date >= localDate(sub.currentPeriodEnd, sub.timezone)
                ) {
                    fieldError(
                        "The subscription ends before that collection",
                        "date",
                    );
                }
                const already = await tx.subscriptionSkip.findFirst({
                    where: { subscriptionId: id, date: dateValue(date) },
                    select: { id: true },
                });
                if (already) dateConflict("That collection is already skipped");
                await tx.subscriptionSkip.create({
                    data: {
                        organizationId: ctx.organizationId,
                        subscriptionId: id,
                        date: dateValue(date),
                        createdByUserId: ctx.userId,
                    },
                });
                await this.log(
                    tx,
                    ctx,
                    id,
                )("COLLECTION_SKIPPED", {
                    data: { date },
                });
            })
            .catch((err: unknown) => {
                if ((err as { code?: string }).code === "P2002") {
                    dateConflict("That collection is already skipped");
                }
                throw err;
            });
        return this.read(ctx, id);
    }

    /**
     * Undo a skip while its collection is still to come. When that skip was
     * why the current period went uncharged, the period is invoiced now, as
     * its renewal would have.
     */
    async unskipCollection(
        ctx: OrganizationContext,
        id: string,
        date: string,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            fieldError("A collection date is YYYY-MM-DD", "date");
        }
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            const skip = await tx.subscriptionSkip.findFirst({
                where: { subscriptionId: id, date: dateValue(date) },
                select: { id: true },
            });
            if (!skip) {
                throw new NotFoundException({
                    message: "That collection is not skipped",
                    details: { field: "date" },
                });
            }
            if (date <= localDate(new Date(), sub.timezone)) {
                dateConflict("That collection has passed");
            }
            await tx.subscriptionSkip.delete({ where: { id: skip.id } });
            const log = this.log(tx, ctx, id);
            await log("COLLECTION_UNSKIPPED", { data: { date } });
            const inPeriod =
                sub.collectionWeekday !== null &&
                collectionDates(
                    {
                        start: sub.currentPeriodStart,
                        end: sub.currentPeriodEnd,
                    },
                    sub.collectionWeekday,
                    sub.timezone,
                ).includes(date);
            if (inPeriod) await this.chargeIfUncharged(tx, ctx, log, sub);
        });
        return this.read(ctx, id);
    }

    /**
     * Book a move to another plan from the next renewal: plan, price and
     * interval switch then, and the period already invoiced is left alone
     * (no proration). A second change replaces the first.
     */
    async changePlan(
        ctx: OrganizationContext,
        id: string,
        dto: ChangePlanDto,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (sub.status === "CANCELLED") {
                throw new ConflictException(
                    "A cancelled subscription cannot change plan.",
                );
            }
            if (sub.cancelAtPeriodEnd) {
                throw new ConflictException(
                    "This subscription ends with its period. Keep it before changing its plan.",
                );
            }
            const plan = await tx.subscriptionPlan.findFirst({
                where: { id: dto.planId, organizationId: ctx.organizationId },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    price: true,
                    currency: true,
                    interval: true,
                },
            });
            if (!plan) notFound("Plan", "planId");
            // Switching onto a plan sells it: never a draft or an archived one.
            assertPlanOnSale(plan);
            if (plan.id === sub.planId) {
                fieldError(`They are already on ${plan.name}`, "planId");
            }
            const onIt = await tx.customerSubscription.count({
                where: {
                    organizationId: ctx.organizationId,
                    planId: plan.id,
                    contactId: sub.contactId,
                    status: { in: ["ACTIVE", "PAUSED"] },
                    id: { not: id },
                },
            });
            if (onIt > 0) alreadyOn(plan.name);
            await tx.customerSubscription.update({
                where: { id },
                data: { pendingPlanId: plan.id },
            });
            await this.log(
                tx,
                ctx,
                id,
            )("PLAN_CHANGE_BOOKED", {
                data: {
                    to: planRef(plan),
                    from: sub.currentPeriodEnd.toISOString(),
                    replaced: sub.pendingPlan ? planRef(sub.pendingPlan) : null,
                },
            });
        });
        return this.read(ctx, id);
    }

    /** Undo a booked plan change. */
    async cancelPlanChange(
        ctx: OrganizationContext,
        id: string,
    ): Promise<SubscriptionView> {
        authorize(ctx, "subscription:write");
        await prisma.$transaction(async (tx) => {
            const sub = await this.lock(tx, ctx.organizationId, id);
            if (!sub.pendingPlanId) {
                throw new ConflictException(
                    "No plan change is waiting for this subscription.",
                );
            }
            await tx.customerSubscription.update({
                where: { id },
                data: { pendingPlanId: null },
            });
            await this.log(
                tx,
                ctx,
                id,
            )("PLAN_CHANGE_CANCELLED", {
                data: {
                    plan: sub.pendingPlan ? planRef(sub.pendingPlan) : null,
                },
            });
        });
        return this.read(ctx, id);
    }

    /**
     * "Retry now" on a failed charge: a new pay link for the unpaid, overdue
     * latest invoice, replacing the old one. Nothing is charged — there is
     * no card on file — the link is what the customer pays through.
     * Needs `invoice:write` as well, as any pay link does.
     */
    async retryPayment(
        ctx: OrganizationContext,
        id: string,
    ): Promise<{ invoiceId: string; token: string }> {
        authorize(ctx, "subscription:write");
        // One transaction under the subscription's lock: the link and its
        // RETRIED commit together, and a refused link records nothing.
        return prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, ctx.organizationId, id);
            const invoices = await this.invoicesFor(
                ctx.organizationId,
                [id],
                tx,
            );
            const failed = failedCharge(row, invoices.get(id), new Date());
            if (!failed) {
                throw new ConflictException(
                    "The latest charge is not overdue, so there is nothing to retry.",
                );
            }
            const { token } = await this.invoices.createPayLinkInTx(
                tx,
                ctx,
                failed.id,
            );
            await this.log(tx, ctx, id)("RETRIED", { invoiceId: failed.id });
            return { invoiceId: failed.id, token };
        });
    }

    /** The business's subscription settings (A8). */
    async settings(
        ctx: OrganizationContext,
    ): Promise<SubscriptionSettingsView> {
        authorize(ctx, "subscription:read");
        return readSubscriptionSettings(ctx.organizationId);
    }

    /** Turn "Members can pause from their account" on or off (A8). */
    async updateSettings(
        ctx: OrganizationContext,
        dto: SubscriptionSettingsDto,
    ): Promise<SubscriptionSettingsView> {
        authorize(ctx, "subscription:write");
        return writeSubscriptionSettings(ctx.organizationId, {
            membersCanPause: dto.membersCanPause,
        });
    }

    /**
     * "Pay now" from a member's account (A8): a fresh pay link for their
     * plan's oldest overdue invoice, replacing the old one, recorded as a
     * RETRIED by the member. Refused while an autopay charge is under way
     * on it (`chargePending`, D13: 409 "Autopay charge in progress"), or
     * when the business can't take payment online.
     */
    async payLinkForCustomer(
        member: CustomerScope,
        id: string,
        chargePending: (invoiceId: string) => Promise<boolean>,
    ): Promise<{ invoiceId: string; token: string }> {
        return prisma.$transaction(async (tx) => {
            const sub = await this.lock(
                tx,
                member.organizationId,
                id,
                member.contactId,
            );
            const invoice =
                sub.status === "CANCELLED"
                    ? null
                    : await overdueInvoiceOf(tx, member, id, new Date());
            if (!invoice) {
                throw new ConflictException("Nothing is overdue on this plan.");
            }
            if (await chargePending(invoice.id)) {
                throw new ConflictException({
                    message: "Autopay charge in progress",
                    details: { reason: "autopay-pending" },
                });
            }
            if (!(await takesPaymentOnline(tx, member.organizationId))) {
                throw new ConflictException(
                    "This can't be paid online just now. Ask the business how to pay.",
                );
            }
            const { token } = await this.invoices.payLinkForCustomer(
                tx,
                member.organizationId,
                invoice.id,
            );
            await this.customerLog(
                tx,
                member,
                id,
            )("RETRIED", {
                invoiceId: invoice.id,
            });
            return { invoiceId: invoice.id, token };
        });
    }

    /**
     * When the renewal job last ran and will next run, and how many renewal
     * invoices went out today. There is no scheduler to look at, so the
     * screen says this rather than leaving silence that reads the same as a
     * stopped job. The run times are the job's, shared by every business.
     */
    async renewals(ctx: OrganizationContext): Promise<RenewalsView> {
        authorize(ctx, "subscription:read");
        // "Today" is the business's day, not UTC's: in Kolkata, UTC midnight
        // is half past five in the morning.
        const profile = await prisma.businessProfile.findUnique({
            where: { organizationId: ctx.organizationId },
            select: { timezone: true },
        });
        const zone =
            profile?.timezone && IANAZone.isValidZone(profile.timezone)
                ? profile.timezone
                : "UTC";
        const midnight = DateTime.now().setZone(zone).startOf("day").toJSDate();
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
    async renewOne(id: string, now: Date): Promise<RenewOutcome> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${id} FOR UPDATE`;
            const sub = await tx.customerSubscription.findUnique({
                where: { id },
                select: SUBSCRIPTION_SELECT,
            });
            // A pause whose end date has come resumes (D8).
            if (sub && pauseHasEnded(sub, now)) {
                return resumeWhenDue(tx, sub, now, (log, ended) =>
                    this.resumeLocked(tx, sub, log, {
                        now,
                        createdByUserId: null,
                        ended,
                    }),
                );
            }
            // A paused subscription only ends — when it was set to.
            const ends = sub?.status === "PAUSED" && sub.cancelAtPeriodEnd;
            if (
                !sub ||
                (sub.status !== "ACTIVE" && !ends) ||
                sub.currentPeriodEnd > now
            ) {
                return "skipped";
            }
            const log = subscriptionEventLog(tx, sub.organizationId, id, JOB);
            if (sub.cancelAtPeriodEnd) {
                await tx.customerSubscription.update({
                    where: { id },
                    data: {
                        status: "CANCELLED",
                        pausedAt: null,
                        cancelledAt: sub.currentPeriodEnd,
                        cancelAtPeriodEnd: false,
                    },
                });
                await log("ENDED", {
                    data: { at: sub.currentPeriodEnd.toISOString() },
                });
                await endMandates(tx, sub.organizationId, id);
                return "ended";
            }

            // A plan change booked for this renewal takes effect now. A new
            // interval starts its own chain where the old period ended.
            const terms = await this.nextTerms(tx, sub);
            const anchor =
                terms.interval !== sub.interval
                    ? sub.currentPeriodEnd
                    : sub.anchorAt;
            const period = periodContaining(
                anchor,
                terms.interval,
                sub.timezone,
                now,
            );
            await tx.customerSubscription.update({
                where: { id },
                data: {
                    currentPeriodStart: period.start,
                    currentPeriodEnd: period.end,
                    ...(anchor !== sub.anchorAt ? { anchorAt: anchor } : {}),
                    ...this.termsData(sub, terms),
                    // The new period's classes: the plan's as they stand
                    // now, or the booked plan's (D10).
                    ...allowanceData(terms.classesPerMonth, now),
                },
            });
            await this.logPlanChanged(log, sub, terms);
            // Once per period: a redelivered run finds it renewed, under the
            // lock, and skips it above.
            const renewed = (
                invoiceId: string | null,
                uncharged = false,
            ): Promise<void> =>
                log("RENEWED", {
                    invoiceId,
                    data: {
                        periodStart: period.start.toISOString(),
                        periodEnd: period.end.toISOString(),
                        ...(uncharged ? { uncharged: true } : {}),
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
            if (live) {
                await renewed(live.id);
                return "advanced";
            }
            if (await this.allSkipped(tx, sub, period)) {
                await renewed(null, true);
                return "uncharged";
            }

            const invoiceId = await this.invoicePeriod(tx, {
                organizationId: sub.organizationId,
                subscriptionId: id,
                contactId: sub.contactId,
                planName: terms.planName,
                price: terms.price,
                currency: terms.currency,
                timezone: sub.timezone,
                period,
                createdByUserId: null,
            });
            await renewed(invoiceId);
            return "renewed";
        });
    }

    // — internals —————————————————————————————————————————————————

    /**
     * The terms the next period is billed at: the booked plan's current
     * price, currency and interval when a change is waiting, else the
     * subscription's own. A change that would put the person on a plan they
     * already hold elsewhere stays waiting rather than trip the one-live
     * index and stall every renewal after it.
     */
    private async nextTerms(tx: Tx, sub: SubscriptionRow): Promise<Terms> {
        const own: Terms = {
            planId: sub.planId,
            planName: sub.plan.name,
            price: toMoneyString(sub.price),
            currency: sub.currency,
            interval: sub.interval as Interval,
            // Price and interval are the subscription's own snapshot; its
            // classes are the plan's as they stand now (D10).
            classesPerMonth: sub.plan.classesPerMonth,
        };
        const next = sub.pendingPlan;
        if (!next) return own;
        const clash = await tx.customerSubscription.count({
            where: {
                planId: next.id,
                contactId: sub.contactId,
                status: { in: ["ACTIVE", "PAUSED"] },
                id: { not: sub.id },
            },
        });
        if (clash > 0) return own;
        return {
            planId: next.id,
            planName: next.name,
            price: toMoneyString(next.price),
            currency: next.currency,
            interval: next.interval as Interval,
            classesPerMonth: next.classesPerMonth,
        };
    }

    /** The row changes that switch a subscription onto new terms. */
    private termsData(
        sub: SubscriptionRow,
        terms: Terms,
    ): Prisma.CustomerSubscriptionUncheckedUpdateInput {
        if (terms.planId === sub.planId) return {};
        return {
            planId: terms.planId,
            price: terms.price,
            currency: terms.currency,
            interval: terms.interval,
            pendingPlanId: null,
        };
    }

    /** True when the period has collections and every one is skipped. */
    private async allSkipped(
        tx: Tx,
        sub: SubscriptionRow,
        period: Period,
    ): Promise<boolean> {
        if (sub.collectionWeekday === null) return false;
        const dates = collectionDates(
            period,
            sub.collectionWeekday,
            sub.timezone,
        );
        if (dates.length === 0) return false;
        const skips = await tx.subscriptionSkip.findMany({
            where: {
                subscriptionId: sub.id,
                date: { in: dates.map(dateValue) },
            },
            select: { date: true },
        });
        return everyCollectionSkipped(
            period,
            sub.collectionWeekday,
            sub.timezone,
            new Set(skips.map((k) => dateKey(k.date))),
        );
    }

    /**
     * After an undone skip or a new collection day: when the current period
     * has begun, has a collection still to come (today or later) that is not
     * skipped, and has no invoice at all — the renewal left it uncharged
     * because every collection was skipped — invoice it now. A voided invoice
     * counts as one: someone chose that. `sub` carries the schedule as it now
     * stands.
     */
    private async chargeIfUncharged(
        tx: Tx,
        ctx: OrganizationContext,
        log: SubscriptionEventLog,
        sub: SubscriptionRow,
    ): Promise<void> {
        const period = {
            start: sub.currentPeriodStart,
            end: sub.currentPeriodEnd,
        };
        const now = new Date();
        if (
            sub.status !== "ACTIVE" ||
            sub.collectionWeekday === null ||
            period.start > now
        ) {
            return;
        }
        const dates = collectionDates(
            period,
            sub.collectionWeekday,
            sub.timezone,
        );
        const skips = await tx.subscriptionSkip.findMany({
            where: {
                subscriptionId: sub.id,
                date: { in: dates.map(dateValue) },
            },
            select: { date: true },
        });
        if (
            !collectionToCome(
                period,
                sub.collectionWeekday,
                sub.timezone,
                localDate(now, sub.timezone),
                new Set(skips.map((k) => dateKey(k.date))),
            )
        ) {
            return;
        }
        const any = await tx.invoice.findFirst({
            where: { subscriptionId: sub.id, periodStart: period.start },
            select: { id: true },
        });
        if (any || !(await paymentsOn(tx, ctx.organizationId))) return;
        const invoiceId = await this.invoicePeriod(tx, {
            organizationId: ctx.organizationId,
            subscriptionId: sub.id,
            contactId: sub.contactId,
            planName: sub.plan.name,
            price: toMoneyString(sub.price),
            currency: sub.currency,
            timezone: sub.timezone,
            period,
            createdByUserId: ctx.userId,
        });
        await log("INVOICED", {
            invoiceId,
            data: {
                periodStart: period.start.toISOString(),
                periodEnd: period.end.toISOString(),
            },
        });
    }

    /** Refuse a collection change on a subscription that is not collecting. */
    private assertCollects(sub: SubscriptionRow): void {
        if (sub.status === "CANCELLED") {
            throw new ConflictException(
                "A cancelled subscription has no collections to skip.",
            );
        }
        if (sub.status === "PAUSED") {
            throw new ConflictException(
                "Resume the subscription before skipping a collection.",
            );
        }
        if (sub.collectionWeekday === null) {
            fieldError("This subscription has no collections to skip", "date");
        }
    }

    /** A real date, on the subscription's collection day. */
    private collectionDate(sub: SubscriptionRow, value: string): string {
        const d = DateTime.fromISO(value, { zone: "UTC" });
        if (!d.isValid) fieldError("That is not a date", "date");
        if (d.weekday !== sub.collectionWeekday) {
            fieldError(
                `There is no collection on ${d.toFormat("cccc d LLL")}`,
                "date",
            );
        }
        return isoDay(d);
    }

    /**
     * Each subscription's skips from yesterday (UTC) on — enough for
     * "today" in any zone — for its upcoming collections.
     */
    private async skipsFor(
        organizationId: string,
        subscriptionIds: string[],
    ): Promise<Map<string, Set<string>>> {
        const byId = new Map<string, Set<string>>();
        if (subscriptionIds.length === 0) return byId;
        const since = dateValue(
            new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        );
        const rows = await prisma.subscriptionSkip.findMany({
            where: {
                organizationId,
                subscriptionId: { in: subscriptionIds },
                date: { gte: since },
            },
            select: { subscriptionId: true, date: true },
        });
        for (const r of rows) {
            const set = byId.get(r.subscriptionId) ?? new Set<string>();
            set.add(dateKey(r.date));
            byId.set(r.subscriptionId, set);
        }
        return byId;
    }

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
    ): Promise<string> {
        const issued = await this.invoices.issueInTx(tx, input.organizationId, {
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
        return issued.id;
    }

    /** This subscription's log in this transaction, as the person acting (D9). */
    private log(
        tx: Tx,
        ctx: OrganizationContext,
        id: string,
    ): SubscriptionEventLog {
        return subscriptionEventLog(
            tx,
            ctx.organizationId,
            id,
            subscriptionActor(ctx),
        );
    }

    /** A booked plan change taking effect is its own event. */
    private async logPlanChanged(
        log: SubscriptionEventLog,
        sub: SubscriptionRow,
        terms: Terms,
    ): Promise<void> {
        if (terms.planId === sub.planId) return;
        await log("PLAN_CHANGED", {
            data: {
                from: planRef({
                    id: sub.planId,
                    name: sub.plan.name,
                    price: sub.price,
                    currency: sub.currency,
                    interval: sub.interval,
                }),
                to: planRef({
                    ...terms,
                    id: terms.planId,
                    name: terms.planName,
                }),
            },
        });
    }

    /** The member's own log, in this transaction (A8). */
    private customerLog(
        tx: Tx,
        member: CustomerScope,
        id: string,
    ): SubscriptionEventLog {
        return subscriptionEventLog(
            tx,
            member.organizationId,
            id,
            customerActor(member.accountId),
        );
    }

    /**
     * Take the row lock, then read it — scoped to the business, and to one
     * person when `contactId` is given (a member acting from their account):
     * anyone else's subscription is not found, and never locked.
     */
    private async lock(
        tx: Tx,
        organizationId: string,
        id: string,
        contactId?: string,
    ): Promise<SubscriptionRow> {
        if (contactId === undefined) {
            await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
        } else {
            await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${id} AND "organizationId" = ${organizationId} AND "contactId" = ${contactId} FOR UPDATE`;
        }
        const sub = await tx.customerSubscription.findFirst({
            where: {
                id,
                organizationId,
                ...(contactId === undefined ? {} : { contactId }),
            },
            select: SUBSCRIPTION_SELECT,
        });
        if (!sub) notFound("Subscription");
        return sub;
    }

    private async read(
        ctx: OrganizationContext,
        id: string,
    ): Promise<SubscriptionView> {
        const { organizationId } = ctx;
        const row = await prisma.customerSubscription.findFirst({
            where: { id, organizationId },
            select: SUBSCRIPTION_SELECT,
        });
        if (!row) notFound("Subscription");
        const [invoices, skips] = await Promise.all([
            this.invoicesFor(organizationId, [id]),
            this.skipsFor(organizationId, [id]),
        ]);
        return forViewer(
            ctx,
            this.view(row, invoices.get(id), skips.get(id), new Date()),
        );
    }

    /**
     * Each subscription's issued and paid invoices in one read: the unpaid
     * ones, oldest first, and the latest of them all.
     */
    private async invoicesFor(
        organizationId: string,
        subscriptionIds: string[],
        db: Tx = prisma,
    ): Promise<Map<string, SubscriptionInvoices>> {
        const byId = new Map<string, SubscriptionInvoices>();
        if (subscriptionIds.length === 0) return byId;
        const rows: InvoiceRowLite[] = await db.invoice.findMany({
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
        skips: ReadonlySet<string> | undefined,
        now: Date,
    ): SubscriptionView {
        const failed = failedCharge(row, invoices, now);
        const unpaid = invoices?.unpaid ?? [];
        const latest = invoices?.latest ?? null;
        const pastDue = unpaid.filter((u) => isPastDue(u, now)).length;
        const renews = row.status === "ACTIVE" && !row.cancelAtPeriodEnd;
        const oldest = unpaid.length > 0 ? unpaid[0] : null;
        return {
            id: row.id,
            status: row.status,
            plan: { id: row.plan.id, name: row.plan.name },
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
            // Only a subscription that has not begun has an empty period.
            startsAt:
                row.status !== "CANCELLED" &&
                row.currentPeriodStart.getTime() ===
                    row.currentPeriodEnd.getTime()
                    ? row.currentPeriodStart.toISOString()
                    : null,
            endsAt:
                row.status === "ACTIVE" && row.cancelAtPeriodEnd
                    ? row.currentPeriodEnd.toISOString()
                    : null,
            pausedAt: row.pausedAt?.toISOString() ?? null,
            pausedUntil:
                row.status === "PAUSED"
                    ? (row.pausedUntil?.toISOString() ?? null)
                    : null,
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
            paymentFailed: failed !== null,
            failedCharge: failed
                ? {
                      id: failed.id,
                      number: failed.number,
                      dueAt: failed.dueAt?.toISOString() ?? null,
                      total: toMoneyString(failed.total),
                  }
                : null,
            collection: this.collectionView(row, skips, now),
            pendingPlan:
                row.pendingPlan && row.status !== "CANCELLED"
                    ? {
                          id: row.pendingPlan.id,
                          name: row.pendingPlan.name,
                          price: toMoneyString(row.pendingPlan.price),
                          currency: row.pendingPlan.currency,
                          interval: row.pendingPlan.interval as Interval,
                          from: row.currentPeriodEnd.toISOString(),
                      }
                    : null,
            // A resume re-anchors a subscription later, so the anchor is
            // its start only while it is the earlier of the two.
            startedAt: (row.anchorAt < row.createdAt ||
            row.currentPeriodStart.getTime() === row.currentPeriodEnd.getTime()
                ? row.anchorAt
                : row.createdAt
            ).toISOString(),
            createdAt: row.createdAt.toISOString(),
        };
    }

    /**
     * The schedule and the next collections. Only an active subscription
     * collects; one set to end stops at its period end; one that has not
     * started begins on its start date.
     */
    private collectionView(
        row: SubscriptionRow,
        skips: ReadonlySet<string> | undefined,
        now: Date,
    ): SubscriptionView["collection"] {
        if (row.collectionWeekday === null) return null;
        const today = localDate(now, row.timezone);
        const start = localDate(row.currentPeriodStart, row.timezone);
        return {
            weekday: row.collectionWeekday,
            note: row.collectionNote,
            upcoming:
                row.status === "ACTIVE"
                    ? upcomingCollections({
                          weekday: row.collectionWeekday,
                          from: start > today ? start : today,
                          until: row.cancelAtPeriodEnd
                              ? localDate(row.currentPeriodEnd, row.timezone)
                              : null,
                          today,
                          skipped: skips ?? new Set(),
                      })
                    : [],
        };
    }
}

/**
 * Payment failed: the latest charge is still unpaid and past its due date.
 * Derived, like "overdue", through the one rule (`isPastDue`); a cancelled
 * subscription has no failed charge to act on.
 */
function failedCharge(
    row: { status: string },
    invoices: SubscriptionInvoices | undefined,
    now: Date,
): InvoiceRowLite | null {
    const latest = invoices?.latest ?? null;
    if (row.status === "CANCELLED" || !latest) return null;
    return isPastDue(latest, now) ? latest : null;
}

/** A plan as an event names it, money as the wire says it. */
function planRef(p: {
    id: string;
    name: string;
    price: { toString(): string };
    currency: string;
    interval: string;
}): EventPlanRef {
    return {
        id: p.id,
        name: p.name,
        price: toMoneyString(p.price),
        currency: p.currency,
        interval: p.interval,
    };
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

/**
 * A subscription that moved to CANCELLED takes its autopay with it (D20):
 * called on every such move, in its transaction, after its event. The
 * mandate is cancelled in Saroh now and at the provider by a job after
 * commit, so a provider timeout never undoes the cancel.
 */
function endMandates(
    tx: Tx,
    organizationId: string,
    subscriptionId: string,
): Promise<unknown> {
    return cancelMandatesInTx(
        tx,
        { organizationId, subscriptionId },
        "SUBSCRIPTION_ENDED",
    );
}
