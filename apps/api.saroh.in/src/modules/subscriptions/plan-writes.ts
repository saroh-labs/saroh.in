import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fromCents, toCents } from "../invoices/totals";
import type { PlanInputDto } from "./dto";
import type { PlanActor } from "./plan-events";
import {
    diffPlan,
    NO_PLAN,
    PLAN_SNAPSHOT_SELECT,
    planSnapshot,
    recordPlanEdit,
    recordPlanEvent,
} from "./plan-events";
import { PLAN_DRAFT, PLAN_NOT_PUBLISHED } from "./plan-on-sale";
import { assertPlanNameFree, lockPlan, lockPlanNames } from "./plans";

/**
 * A plan's writes: create, change, archive and sell again. Each runs in one
 * transaction with the plan event it records (D2), so a refused or failed
 * write records nothing. The service authorizes and reads the plan back.
 */

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function planNotFound(): never {
    throw new NotFoundException("Plan not found");
}

/** Create a plan and record it; answers with its id. */
export async function createPlanRow(
    organizationId: string,
    actor: PlanActor,
    dto: PlanInputDto,
): Promise<string> {
    const { name, price, currency, interval } = dto;
    if (!name) fieldError("Give the plan a name", "name");
    if (!price) fieldError("Set a price", "price");
    if (!currency) fieldError("Choose a currency", "currency");
    if (!interval) fieldError("Choose how often it renews", "interval");
    const created = await prisma.$transaction(async (tx) => {
        await lockPlanNames(tx, organizationId);
        await assertPlanNameFree(tx, organizationId, name);
        const plan = await tx.subscriptionPlan.create({
            data: {
                organizationId,
                name,
                description: dto.description ?? null,
                price: fromCents(toCents(price)),
                currency,
                interval,
                classesPerMonth: dto.classesPerMonth ?? null,
            },
            select: { id: true, ...PLAN_SNAPSHOT_SELECT },
        });
        await recordPlanEvent(
            tx,
            organizationId,
            plan.id,
            "CREATED",
            actor,
            diffPlan(NO_PLAN, planSnapshot(plan)),
        );
        return plan;
    });
    return created.id;
}

/**
 * Change a plan, and record what changed. A change reaches only future
 * sign-ups: everyone already on it keeps the terms they bought.
 */
export async function updatePlanRow(
    organizationId: string,
    actor: PlanActor,
    id: string,
    dto: PlanInputDto,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        if (dto.name !== undefined) await lockPlanNames(tx, organizationId);
        // Held to the commit, so the "before" the event records is the plan
        // this save changed, not one another save has since.
        await lockPlan(tx, organizationId, id);
        const plan = await tx.subscriptionPlan.findFirst({
            where: { id, organizationId },
            select: PLAN_SNAPSHOT_SELECT,
        });
        if (!plan) planNotFound();
        // An archived plan's name is checked when it is sold again.
        if (dto.name !== undefined && plan.status !== "ARCHIVED") {
            await assertPlanNameFree(tx, organizationId, dto.name, id);
        }
        const data = {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined
                ? { description: dto.description }
                : {}),
            ...(dto.price !== undefined
                ? { price: fromCents(toCents(dto.price)) }
                : {}),
            ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
            ...(dto.interval !== undefined ? { interval: dto.interval } : {}),
            ...(dto.classesPerMonth !== undefined
                ? { classesPerMonth: dto.classesPerMonth }
                : {}),
        };
        await tx.subscriptionPlan.updateMany({
            where: { id, organizationId },
            data,
        });
        await recordPlanEdit(
            tx,
            organizationId,
            id,
            actor,
            planSnapshot(plan),
            planSnapshot({ ...plan, ...data }),
        );
    });
}

/**
 * Archived plans take no new sign-ups; everyone on them carries on.
 * Selling one again needs its name free: another plan may have taken it
 * while it was archived.
 */
export async function setPlanStatusRow(
    organizationId: string,
    actor: PlanActor,
    id: string,
    status: "ACTIVE" | "ARCHIVED",
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        if (status === "ACTIVE") await lockPlanNames(tx, organizationId);
        await lockPlan(tx, organizationId, id);
        const plan = await tx.subscriptionPlan.findFirst({
            where: { id, organizationId },
            select: { name: true, status: true },
        });
        if (!plan) planNotFound();
        // A draft is sold only by publishing it (D5). "Sell again" would put
        // it on sale unchecked, and archiving it would let "Sell again" do so
        // next; both are refused, whichever the draft (D21).
        if (plan.status === PLAN_DRAFT) {
            throw new ConflictException({
                message: PLAN_NOT_PUBLISHED,
                details: { field: "status" },
            });
        }
        if (status === "ACTIVE" && plan.status === "ARCHIVED") {
            await assertPlanNameFree(tx, organizationId, plan.name, id);
        }
        await tx.subscriptionPlan.updateMany({
            where: { id, organizationId },
            data: { status },
        });
        // Archiving an archived plan, or restoring a live one, changes
        // nothing, and nothing is recorded.
        if (plan.status !== status) {
            await recordPlanEvent(
                tx,
                organizationId,
                id,
                status === "ARCHIVED" ? "ARCHIVED" : "RESTORED",
                actor,
                { status: [plan.status, status] },
            );
        }
    });
}
