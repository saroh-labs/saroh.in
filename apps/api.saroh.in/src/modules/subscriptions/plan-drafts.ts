import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { DraftPatch } from "../../common/drafts/draft-record";
import {
    diffValues,
    mergeForEditor,
    nextPending,
    pickPatch,
    samePending,
} from "../../common/drafts/draft-record";
import { toMoneyString } from "../../common/money";
import { businessCurrency } from "../stores/currency";
import type { PlanDraftDto, PlanInputDto } from "./dto";
import type { PlanDraftRow, PlanValues } from "./plan-draft-view";
import {
    checkPlanRevision,
    columnValues,
    pendingOf,
    PLAN_DRAFT_FIELDS,
    PLAN_DRAFT_SELECT,
    planProblems,
    savedById,
    timesSold,
    valueColumns,
    valuesSnapshot,
} from "./plan-draft-view";
import type { PlanActor } from "./plan-events";
import {
    diffPlan,
    NO_PLAN,
    recordPlanEdit,
    recordPlanEvent,
} from "./plan-events";
import { PLAN_DRAFT, PLAN_ON_SALE } from "./plan-on-sale";
import { lockPlan, lockPlanNames } from "./plans";

/**
 * The Plan Editor's writes (round-2 D5, the draft writers; D21 shipped the
 * readers that refuse a DRAFT). A new plan starts as a DRAFT, which nobody
 * can buy. A live plan's edits go to a pending set beside its published
 * columns, which buyers keep reading until someone publishes.
 *
 * Every write takes the plan's row lock, then checks the revision the
 * editor holds (a stale one is a 409 naming who saved since, and nothing is
 * written), then bumps it. Publish also takes the name lock first and
 * checks the plan again as a whole. The service authorizes and reads the
 * plan back for the editor.
 */

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function planNotFound(): never {
    throw new NotFoundException("Plan not found");
}

function refuse(message: string, field = "status"): never {
    throw new ConflictException({ message, details: { field } });
}

const ARCHIVED_REFUSAL =
    "This plan is archived. Sell it again before changing it.";

/** Read the plan under its row lock (taken by the caller). */
async function lockedRow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
): Promise<PlanDraftRow> {
    await lockPlan(tx, organizationId, id);
    const row = await tx.subscriptionPlan.findFirst({
        where: { id, organizationId },
        select: PLAN_DRAFT_SELECT,
    });
    if (!row) planNotFound();
    return row;
}

/**
 * The editor's fields as values: money as "1500.00". A name, currency or
 * interval can't be emptied; a price can (a draft not priced yet).
 */
function patchOf(dto: PlanInputDto): DraftPatch<PlanValues> {
    // The DTO's @IsOptional lets an explicit null through every field.
    const sent = dto as Record<string, unknown>;
    if (sent.name === null) fieldError("Give the plan a name", "name");
    if (sent.currency === null) fieldError("Choose a currency", "currency");
    if (sent.interval === null) {
        fieldError("Choose how often it renews", "interval");
    }
    const patch = pickPatch<PlanValues>(PLAN_DRAFT_FIELDS, sent);
    if (typeof patch.price === "string") {
        patch.price = toMoneyString(patch.price);
    }
    return patch;
}

/**
 * The first autosave of a new plan, which has a name: a DRAFT. Whatever
 * else isn't given yet is a placeholder the editor shows as unset (price)
 * or as its default (the business's currency, monthly). A name another
 * plan has is kept, and stops Publish until it changes.
 */
export async function createPlanDraft(
    organizationId: string,
    actor: PlanActor,
    dto: PlanInputDto,
): Promise<string> {
    const name = dto.name;
    if (!name) fieldError("Give the plan a name", "name");
    const patch = patchOf(dto);
    return prisma.$transaction(async (tx) => {
        const currency =
            patch.currency ??
            (await businessCurrency(tx, organizationId)) ??
            "INR";
        const values: PlanValues = {
            name,
            description: patch.description ?? null,
            price: patch.price ?? null,
            currency,
            interval: patch.interval ?? "MONTH",
            classesPerMonth: patch.classesPerMonth ?? null,
        };
        const plan = await tx.subscriptionPlan.create({
            data: {
                organizationId,
                ...valueColumns(values),
                status: PLAN_DRAFT,
                pendingChangedAt: new Date(),
                pendingChangedById: savedById(actor),
            },
            select: { id: true },
        });
        await recordPlanEvent(
            tx,
            organizationId,
            plan.id,
            "CREATED",
            actor,
            diffPlan(NO_PLAN, valuesSnapshot(values, PLAN_DRAFT)),
        );
        return plan.id;
    });
}

/**
 * Autosave. A DRAFT's columns are written directly (nothing is live, and
 * no event is recorded until it is published). A live plan's go to its
 * pending set, holding only what differs from what is live. A save that
 * changes nothing writes nothing and keeps the revision.
 */
export async function savePlanDraft(
    organizationId: string,
    actor: PlanActor,
    id: string,
    dto: PlanDraftDto,
): Promise<void> {
    const patch = patchOf(dto);
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status !== PLAN_DRAFT && row.status !== PLAN_ON_SALE) {
            refuse(ARCHIVED_REFUSAL);
        }
        await checkPlanRevision(tx, organizationId, row, dto.revision);
        const saved = {
            draftRevision: { increment: 1 },
            pendingChangedAt: new Date(),
            pendingChangedById: savedById(actor),
        };

        if (row.status === PLAN_DRAFT) {
            const before = columnValues(row);
            const after = { ...before, ...patch };
            if (
                !Object.keys(diffValues(PLAN_DRAFT_FIELDS, before, after))
                    .length
            ) {
                return;
            }
            await tx.subscriptionPlan.updateMany({
                where: { id, organizationId },
                data: { ...valueColumns(after), ...saved },
            });
            return;
        }

        const held = pendingOf(row);
        const next = nextPending(
            PLAN_DRAFT_FIELDS,
            columnValues(row),
            held,
            patch,
        );
        if (samePending(held, next)) return;
        await tx.subscriptionPlan.updateMany({
            where: { id, organizationId },
            data: next
                ? { pendingChanges: next, ...saved }
                : {
                      // Every change was put back as it is live: none left.
                      pendingChanges: Prisma.DbNull,
                      pendingChangedAt: null,
                      pendingChangedById: null,
                      draftRevision: { increment: 1 },
                  },
        });
    });
}

/** Clears a plan's draft state, once published or discarded. */
const CLEARED = {
    pendingChanges: Prisma.DbNull,
    pendingChangedAt: null,
    pendingChangedById: null,
    draftRevision: { increment: 1 },
};

/**
 * Publish a DRAFT (it goes on sale), or a live plan's pending changes (they
 * become its terms for new sign-ups; everyone already on it keeps theirs,
 * ADR-007). Checked as a whole first: a name another plan has, or no price,
 * is a 409 on that field and nothing is published. A live plan with nothing
 * pending publishes nothing.
 */
export async function publishPlan(
    organizationId: string,
    actor: PlanActor,
    id: string,
    revision: number,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await lockPlanNames(tx, organizationId);
        const row = await lockedRow(tx, organizationId, id);
        if (row.status !== PLAN_DRAFT && row.status !== PLAN_ON_SALE) {
            refuse(ARCHIVED_REFUSAL);
        }
        await checkPlanRevision(tx, organizationId, row, revision);

        const live = columnValues(row);
        const held = pendingOf(row);
        const isDraft = row.status === PLAN_DRAFT;
        if (!isDraft && !held) return;
        const target = isDraft ? live : mergeForEditor(live, held);

        const problems = await planProblems(tx, organizationId, id, target);
        if (problems.length) refuse(problems[0].message, problems[0].field);

        await tx.subscriptionPlan.updateMany({
            where: { id, organizationId },
            data: { ...valueColumns(target), status: PLAN_ON_SALE, ...CLEARED },
        });
        if (isDraft) {
            // What it went on sale with, as its first live terms.
            const changes = diffPlan(
                NO_PLAN,
                valuesSnapshot(target, PLAN_ON_SALE),
            );
            changes.status = [PLAN_DRAFT, PLAN_ON_SALE];
            await recordPlanEvent(
                tx,
                organizationId,
                id,
                "PUBLISHED",
                actor,
                changes,
            );
        } else {
            // Recorded as the change it is ("changed the price from …"), as
            // a change through the old form was (D2).
            await recordPlanEdit(
                tx,
                organizationId,
                id,
                actor,
                valuesSnapshot(live, row.status),
                valuesSnapshot(target, row.status),
            );
        }
    });
}

/**
 * Drop a live plan's unpublished changes; what is live stays. A draft has
 * nothing live to go back to (Delete draft is its way out).
 */
export async function discardPlanChanges(
    organizationId: string,
    actor: PlanActor,
    id: string,
    revision: number,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status === PLAN_DRAFT) {
            refuse(
                "A draft has nothing published to go back to. Delete the draft instead.",
            );
        }
        await checkPlanRevision(tx, organizationId, row, revision);
        const held = pendingOf(row);
        if (!held) return;
        const live = columnValues(row);
        await tx.subscriptionPlan.updateMany({
            where: { id, organizationId },
            data: CLEARED,
        });
        await recordPlanEvent(
            tx,
            organizationId,
            id,
            "DRAFT_DISCARDED",
            actor,
            diffPlan(
                valuesSnapshot(mergeForEditor(live, held), row.status),
                valuesSnapshot(live, row.status),
            ),
        );
    });
}

/**
 * Delete a DRAFT nobody has bought (or is booked to switch to). Its events
 * go with it. A published plan is archived instead.
 */
export async function deletePlanDraft(
    organizationId: string,
    id: string,
    revision: number,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status !== PLAN_DRAFT) {
            refuse(
                "Only a draft can be deleted. Archive this plan to stop new sign-ups.",
            );
        }
        await checkPlanRevision(tx, organizationId, row, revision);
        if ((await timesSold(tx, organizationId, id)) > 0) {
            refuse("People are on this plan, so it can't be deleted.");
        }
        await tx.subscriptionPlan.deleteMany({ where: { id, organizationId } });
    });
}
