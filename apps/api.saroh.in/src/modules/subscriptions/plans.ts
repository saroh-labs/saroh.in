import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { Interval } from "./periods";
import type { PlanFigures, PriceGroup } from "./plan-figures";
import { planFigures } from "./plan-figures";

/**
 * Reading a plan with its figures, and the one-name-per-business rule
 * (plan 2026-09-26-004, D1). Module functions, so the service's plan
 * methods stay a few lines each.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface PlanView extends PlanFigures {
    id: string;
    name: string;
    description: string | null;
    price: string;
    currency: string;
    interval: Interval;
    status: string;
    /** A membership's classes a month. Null: as many as they like. */
    classesPerMonth: number | null;
    createdAt: string;
}

const PLAN_SELECT = {
    id: true,
    name: true,
    description: true,
    price: true,
    currency: true,
    interval: true,
    status: true,
    classesPerMonth: true,
    createdAt: true,
} as const;

type PlanRow = Prisma.SubscriptionPlanGetPayload<{
    select: typeof PLAN_SELECT;
}>;

/** People on a plan now: active or paused. */
const LIVE = ["ACTIVE", "PAUSED"];

/**
 * Plans with their figures. Every plan's subscribers are counted in one
 * grouped query, by the terms each pays, whatever the number of plans.
 */
export async function planViews(
    organizationId: string,
    where: Prisma.SubscriptionPlanWhereInput,
): Promise<PlanView[]> {
    const rows = await prisma.subscriptionPlan.findMany({
        where: { ...where, organizationId },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        select: PLAN_SELECT,
    });
    if (rows.length === 0) return [];
    const groups = await prisma.customerSubscription.groupBy({
        by: ["planId", "price", "currency", "interval", "status"],
        where: {
            organizationId,
            planId: { in: rows.map((r) => r.id) },
            status: { in: LIVE },
        },
        _count: { _all: true },
    });
    const byPlan = new Map<string, PriceGroup[]>();
    for (const g of groups) {
        const list = byPlan.get(g.planId) ?? [];
        list.push({
            price: g.price,
            currency: g.currency,
            interval: g.interval,
            status: g.status,
            count: g._count._all,
        });
        byPlan.set(g.planId, list);
    }
    return rows.map((r) => planView(r, byPlan.get(r.id) ?? []));
}

/** One plan with its figures; another business's is a 404. */
export async function readPlan(
    organizationId: string,
    id: string,
): Promise<PlanView> {
    const views = await planViews(organizationId, { id });
    if (views.length === 0) throw new NotFoundException("Plan not found");
    return views[0];
}

function planView(row: PlanRow, groups: readonly PriceGroup[]): PlanView {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: toMoneyString(row.price),
        currency: row.currency,
        interval: row.interval as Interval,
        status: row.status,
        classesPerMonth: row.classesPerMonth,
        createdAt: row.createdAt.toISOString(),
        ...planFigures(row, groups),
    };
}

/**
 * Serialise every plan-name write in a business for the rest of the
 * transaction, so two saves of the same name at once cannot both pass the
 * check. Taken before any row lock a plan write takes.
 */
export async function lockPlanNames(
    tx: Prisma.TransactionClient,
    organizationId: string,
): Promise<void> {
    const key = `subscription-plan-name:${organizationId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Lock one plan's row for the rest of the transaction, so two changes to it
 * run one after the other and each event's "before" is what that change
 * saw (D2). FOR NO KEY UPDATE: a subscription or an event naming the plan
 * takes FOR KEY SHARE on it, which this doesn't wait on. Taken after
 * {@link lockPlanNames}. Locks nothing for another business's plan, which
 * the caller's read then answers with a 404.
 */
export async function lockPlan(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "SubscriptionPlan" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
}

/**
 * Names are unique per business among plans that aren't archived, ignoring
 * case and the spaces around them (the DTO trims). An archived plan's name
 * is free to reuse. A clash is a 409 naming the other plan.
 */
export async function assertPlanNameFree(
    db: Db,
    organizationId: string,
    name: string,
    exceptId?: string,
): Promise<void> {
    const clash = await db.subscriptionPlan.findFirst({
        where: {
            organizationId,
            status: { not: "ARCHIVED" },
            name: { equals: name.trim(), mode: "insensitive" },
            ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        select: { id: true, name: true },
    });
    if (clash) {
        throw new ConflictException({
            message: `There is already a plan called ${clash.name}. Give this one another name.`,
            details: { field: "name", planId: clash.id },
        });
    }
}
