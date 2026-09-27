import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { PLAN_EVENTS_PAGE_MAX } from "./dto";

/**
 * A plan's history (plan 2026-09-26-004, D2): one event for every change,
 * written in the same transaction as the change, with who made it and each
 * changed field's value before and after. Append-only: this file writes
 * rows and reads them; nothing here, or anywhere, updates or deletes one.
 */

export const PLAN_EVENT_KINDS = [
    "CREATED",
    /** A draft's pending changes published (D5). */
    "PUBLISHED",
    "PRICE_CHANGED",
    "CLASSES_CHANGED",
    "RENAMED",
    "DESCRIPTION_CHANGED",
    /** One save that changed more than one of the above. */
    "UPDATED",
    "ARCHIVED",
    /** Sold again after being archived. */
    "RESTORED",
    /** A live plan's unpublished changes dropped (D5). */
    "DRAFT_DISCARDED",
] as const;
export type PlanEventKind = (typeof PLAN_EVENT_KINDS)[number];

/** A team member; the renewal job; a Saroh operator (shown as Saroh support). */
export const PLAN_ACTOR_KINDS = ["TEAM", "JOB", "OPERATOR"] as const;
export type PlanActorKind = (typeof PLAN_ACTOR_KINDS)[number];

/** The fields a plan event records. Nothing else about a plan is diffed. */
export const PLAN_EVENT_FIELDS = [
    "name",
    "description",
    "price",
    "currency",
    "interval",
    "classesPerMonth",
    "status",
] as const;
export type PlanEventField = (typeof PLAN_EVENT_FIELDS)[number];

type FieldValue = string | number | null;

/** A plan's recorded fields, as the wire carries them: money as "1500.00". */
export type PlanSnapshot = Record<PlanEventField, FieldValue>;

/** `{ field: [before, after] }`, only the fields that changed. */
export type PlanChanges = Partial<
    Record<PlanEventField, [FieldValue, FieldValue]>
>;

/** Every recorded field as nothing, for a plan's first event. */
export const NO_PLAN: PlanSnapshot = {
    name: null,
    description: null,
    price: null,
    currency: null,
    interval: null,
    classesPerMonth: null,
    status: null,
};

/** The columns a snapshot is read from. */
export const PLAN_SNAPSHOT_SELECT = {
    name: true,
    description: true,
    price: true,
    currency: true,
    interval: true,
    classesPerMonth: true,
    status: true,
} as const;

export interface PlanRowForEvents {
    name: string;
    description: string | null;
    price: { toString(): string };
    currency: string;
    interval: string;
    classesPerMonth: number | null;
    status: string;
}

export function planSnapshot(row: PlanRowForEvents): PlanSnapshot {
    return {
        name: row.name,
        description: row.description,
        price: toMoneyString(row.price),
        currency: row.currency,
        interval: row.interval,
        classesPerMonth: row.classesPerMonth,
        status: row.status,
    };
}

/** The recorded fields that differ, each as `[before, after]`. */
export function diffPlan(
    before: PlanSnapshot,
    after: PlanSnapshot,
): PlanChanges {
    const changes: PlanChanges = {};
    for (const field of PLAN_EVENT_FIELDS) {
        if (before[field] !== after[field]) {
            changes[field] = [before[field], after[field]];
        }
    }
    return changes;
}

/** What an edit is called, by which part of the plan it touched. */
const EDIT_KIND: Record<Exclude<PlanEventField, "status">, PlanEventKind> = {
    price: "PRICE_CHANGED",
    currency: "PRICE_CHANGED",
    interval: "PRICE_CHANGED",
    classesPerMonth: "CLASSES_CHANGED",
    name: "RENAMED",
    description: "DESCRIPTION_CHANGED",
};

/**
 * The kind of an edit's event: the one part it touched, or UPDATED when it
 * touched more than one. Null when nothing changed, and nothing is written.
 */
export function editKind(changes: PlanChanges): PlanEventKind | null {
    const kinds = new Set<PlanEventKind>();
    for (const field of Object.keys(changes) as PlanEventField[]) {
        if (field !== "status") kinds.add(EDIT_KIND[field]);
    }
    if (kinds.size === 0) return null;
    return kinds.size === 1 ? [...kinds][0] : "UPDATED";
}

export interface PlanActor {
    actorKind: PlanActorKind;
    actorUserId: string | null;
}

/**
 * Who a request's change is recorded as. A Saroh operator acts through a
 * `platform-operator` context and is recorded as OPERATOR, which the read
 * shows as Saroh support, never by name (DEC-035).
 */
export function planActor(ctx: OrganizationContext): PlanActor {
    return {
        actorKind:
            ctx.roleKey === PLATFORM_OPERATOR_ROLE_KEY ? "OPERATOR" : "TEAM",
        actorUserId: ctx.userId,
    };
}

/** Write one event. Called inside the change's own transaction. */
export async function recordPlanEvent(
    tx: Prisma.TransactionClient,
    organizationId: string,
    planId: string,
    kind: PlanEventKind,
    actor: PlanActor,
    changes: PlanChanges,
): Promise<void> {
    await tx.subscriptionPlanEvent.create({
        data: {
            organizationId,
            planId,
            kind,
            actorKind: actor.actorKind,
            actorUserId: actor.actorUserId,
            changes,
        },
    });
}

/**
 * Record an edit: diff the plan before and after, and write one event when
 * anything recorded changed. Returns whether it wrote one.
 */
export async function recordPlanEdit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    planId: string,
    actor: PlanActor,
    before: PlanSnapshot,
    after: PlanSnapshot,
): Promise<boolean> {
    const changes = diffPlan(before, after);
    const kind = editKind(changes);
    if (!kind) return false;
    await recordPlanEvent(tx, organizationId, planId, kind, actor, changes);
    return true;
}

// — Reading ——————————————————————————————————————————————————————————

export const PLAN_EVENTS_PAGE = 50;

export interface PlanEventView {
    id: string;
    kind: PlanEventKind;
    changes: PlanChanges;
    actor: {
        kind: PlanActorKind;
        /** Null for Saroh support and the job, whose ids aren't shown. */
        userId: string | null;
        /**
         * The team member's name as it is now, "Saroh support" for an
         * operator, "Saroh" for the job; null for someone with no name.
         */
        name: string | null;
    };
    createdAt: string;
}

export interface PlanEventsPage {
    /** Newest first. */
    events: PlanEventView[];
    /** The last event's id on this page, to ask for the next; null at the end. */
    nextCursor: string | null;
    /**
     * The plan was made before its history was kept (the D2 deploy), so the
     * oldest event isn't its creation: "Earlier changes weren't recorded".
     */
    earlierUnrecorded: boolean;
}

/**
 * A plan's events, newest first, paged by the last event's id. Another
 * business's plan, or a cursor that isn't one of this plan's events, is
 * refused before anything is read.
 */
export async function listPlanEvents(
    organizationId: string,
    planId: string,
    options: { cursor?: string; limit?: number } = {},
): Promise<PlanEventsPage> {
    const plan = await prisma.subscriptionPlan.findFirst({
        where: { id: planId, organizationId },
        select: { id: true },
    });
    if (!plan) throw new NotFoundException("Plan not found");

    const take = Math.min(
        Math.max(options.limit ?? PLAN_EVENTS_PAGE, 1),
        PLAN_EVENTS_PAGE_MAX,
    );
    const mine = { organizationId, planId };
    let after: Prisma.SubscriptionPlanEventWhereInput = {};
    if (options.cursor) {
        const from = await prisma.subscriptionPlanEvent.findFirst({
            where: { ...mine, id: options.cursor },
            select: { id: true, createdAt: true },
        });
        if (!from) {
            throw new BadRequestException({
                message: "That page of the history isn't there any more",
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

    const [rows, created] = await Promise.all([
        prisma.subscriptionPlanEvent.findMany({
            where: { ...mine, ...after },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: take + 1,
            select: {
                id: true,
                kind: true,
                actorKind: true,
                actorUserId: true,
                changes: true,
                createdAt: true,
            },
        }),
        prisma.subscriptionPlanEvent.findFirst({
            where: { ...mine, kind: "CREATED" },
            select: { id: true },
        }),
    ]);
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const teamIds = [
        ...new Set(
            page.flatMap((e) =>
                e.actorKind === "TEAM" && e.actorUserId ? [e.actorUserId] : [],
            ),
        ),
    ];
    const users =
        teamIds.length > 0
            ? await prisma.user.findMany({
                  where: { id: { in: teamIds } },
                  select: { id: true, name: true },
              })
            : [];
    const names = new Map(users.map((u) => [u.id, u.name]));

    return {
        events: page.map((e) => ({
            id: e.id,
            kind: e.kind as PlanEventKind,
            changes: (e.changes ?? {}) as PlanChanges,
            actor: actorView(
                e.actorKind as PlanActorKind,
                e.actorUserId,
                names,
            ),
            createdAt: e.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
        earlierUnrecorded: !created,
    };
}

function actorView(
    kind: PlanActorKind,
    userId: string | null,
    names: ReadonlyMap<string, string | null>,
): PlanEventView["actor"] {
    // An operator's own id would tell the business which of Saroh's staff it
    // was, and tie their changes together across businesses (DEC-035).
    if (kind === "OPERATOR") {
        return { kind, userId: null, name: "Saroh support" };
    }
    if (kind === "JOB") return { kind, userId: null, name: "Saroh" };
    return {
        kind,
        userId,
        name: userId ? (names.get(userId) ?? null) : null,
    };
}
