import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    DraftPatch,
    DraftRevisionState,
} from "../../common/drafts/draft-record";
import {
    assertRevision,
    mergeForEditor,
    readPending,
} from "../../common/drafts/draft-record";
import { toMinor, toMoneyString } from "../../common/money";
import { actorView, teamNames } from "./event-actors";
import type { PlanActor, PlanActorKind, PlanSnapshot } from "./plan-events";
import { PLAN_DRAFT } from "./plan-on-sale";
import { nameTakenMessage, planNameClash } from "./plans";

/**
 * A plan as the Plan Editor reads it (round-2 D5): the values it shows, what
 * is live, whether it holds unpublished changes, the revision every save
 * carries, and what stops it being published. The shapes are the editor
 * shell's `EditorRecord` (`apps/app.saroh.in/lib/editor-shell/types.ts`).
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** The fields a plan's draft holds; nothing else is published. */
export const PLAN_DRAFT_FIELDS = [
    "name",
    "description",
    "price",
    "currency",
    "interval",
    "classesPerMonth",
] as const;

/**
 * A plan's publishable values, as the editor sends and shows them. `price`
 * is "1500.00"; null on a draft whose price isn't set yet (stored as 0,
 * since the column can't be empty).
 */
export interface PlanValues {
    name: string;
    description: string | null;
    price: string | null;
    currency: string;
    interval: string;
    classesPerMonth: number | null;
}

/** A reason the plan can't be published yet, beside its field. */
export interface PlanProblem {
    field: string;
    message: string;
}

export interface PlanEditorView {
    id: string;
    status: string;
    /** A live plan holds a set of unpublished changes. */
    hasPendingChanges: boolean;
    /** Sent back with every save, publish, discard and delete (#285). */
    revision: number;
    /** What the editor shows: a draft's columns, or live with pending over. */
    values: PlanValues;
    /** What is live now; null for a draft. */
    published: PlanValues | null;
    /** A draft nobody has bought, so Delete draft is allowed. */
    canDelete: boolean;
    /** What stops Publish now. Empty when it can be published. */
    problems: PlanProblem[];
    /** When the draft or the pending set was last saved; null when none. */
    pendingChangedAt: string | null;
}

export const PLAN_DRAFT_SELECT = {
    id: true,
    status: true,
    name: true,
    description: true,
    price: true,
    currency: true,
    interval: true,
    classesPerMonth: true,
    pendingChanges: true,
    pendingChangedAt: true,
    pendingChangedById: true,
    draftRevision: true,
} as const;

export type PlanDraftRow = Prisma.SubscriptionPlanGetPayload<{
    select: typeof PLAN_DRAFT_SELECT;
}>;

/** The plan's columns as values: what is live, or a draft's own. */
export function columnValues(row: PlanDraftRow): PlanValues {
    const unpriced = row.status === PLAN_DRAFT && toMinor(row.price) === 0;
    return {
        name: row.name,
        description: row.description,
        price: unpriced ? null : toMoneyString(row.price),
        currency: row.currency,
        interval: row.interval,
        classesPerMonth: row.classesPerMonth,
    };
}

export function pendingOf(row: PlanDraftRow): DraftPatch<PlanValues> | null {
    if (row.status === PLAN_DRAFT) return null;
    return readPending<PlanValues>(PLAN_DRAFT_FIELDS, row.pendingChanges);
}

/** What the editor shows: a draft's columns, or live with pending over. */
export function editorValues(row: PlanDraftRow): PlanValues {
    return mergeForEditor(columnValues(row), pendingOf(row));
}

/** Values as the columns take them. An unset price is stored as 0. */
export function valueColumns(values: PlanValues) {
    return {
        name: values.name,
        description: values.description,
        price: values.price ?? "0",
        currency: values.currency,
        interval: values.interval,
        classesPerMonth: values.classesPerMonth,
    };
}

/** Values as a plan event records them (D2). */
export function valuesSnapshot(
    values: PlanValues,
    status: string,
): PlanSnapshot {
    return { ...values, status };
}

/** How an operator's save is named, as the plan's history names them. */
const SAROH_SUPPORT = "Saroh support";

/** Who a save by `actor` is stored as: never a Saroh operator (DEC-035). */
export function savedById(actor: PlanActor): string | null {
    return actor.actorKind === "OPERATOR" ? null : actor.actorUserId;
}

/**
 * What stops these values being published: a name (free among live and
 * draft plans, D1) and a price above zero. The DTO has already checked
 * each field's shape and range.
 */
export async function planProblems(
    db: Db,
    organizationId: string,
    id: string,
    values: PlanValues,
): Promise<PlanProblem[]> {
    const problems: PlanProblem[] = [];
    if (!values.name.trim()) {
        problems.push({ field: "name", message: "Give the plan a name" });
    } else {
        const clash = await planNameClash(db, organizationId, values.name, id);
        if (clash) {
            problems.push({
                field: "name",
                message: nameTakenMessage(clash.name),
            });
        }
    }
    if (!values.price || toMinor(values.price) === 0) {
        problems.push({ field: "price", message: "Set a price" });
    }
    return problems;
}

/**
 * Who moved the revision last, and when: the draft's own last save, or the
 * plan's newest event (a publish, a discard, an archive, a change through
 * the old form), whichever is later. Named as the plan's history names
 * them: Saroh support for an operator (DEC-035).
 */
async function lastChange(
    db: Db,
    organizationId: string,
    row: PlanDraftRow,
): Promise<Omit<DraftRevisionState, "revision">> {
    const event = await db.subscriptionPlanEvent.findFirst({
        where: { organizationId, planId: row.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { actorKind: true, actorUserId: true, createdAt: true },
    });
    const savedAt = row.pendingChangedAt;
    if (savedAt && (!event || savedAt >= event.createdAt)) {
        const by = row.pendingChangedById;
        // A save with a time and no person is an operator's (savedById).
        if (!by) return { changedBy: SAROH_SUPPORT, changedAt: savedAt };
        const names = await teamNames([{ actorKind: "TEAM", actorUserId: by }]);
        return { changedBy: names.get(by) ?? null, changedAt: savedAt };
    }
    if (!event) return { changedBy: null, changedAt: null };
    const names = await teamNames([event]);
    const view = actorView(
        event.actorKind as PlanActorKind,
        event.actorUserId,
        names,
    );
    return { changedBy: view.name, changedAt: event.createdAt };
}

/**
 * Refuse (409) a write from an editor holding an older revision, naming who
 * saved since. Nothing is read for a current one.
 */
export async function checkPlanRevision(
    db: Db,
    organizationId: string,
    row: PlanDraftRow,
    yours: number,
): Promise<void> {
    if (yours === row.draftRevision) return;
    assertRevision(
        yours,
        {
            revision: row.draftRevision,
            ...(await lastChange(db, organizationId, row)),
        },
        "plan",
    );
}

/** The editor's view of a plan row. */
export async function planEditorView(
    db: Db,
    organizationId: string,
    row: PlanDraftRow,
): Promise<PlanEditorView> {
    const isDraft = row.status === PLAN_DRAFT;
    const values = editorValues(row);
    const [problems, sold] = await Promise.all([
        planProblems(db, organizationId, row.id, values),
        isDraft ? timesSold(db, organizationId, row.id) : Promise.resolve(0),
    ]);
    return {
        id: row.id,
        status: row.status,
        hasPendingChanges: pendingOf(row) !== null,
        revision: row.draftRevision,
        values,
        published: isDraft ? null : columnValues(row),
        canDelete: isDraft && sold === 0,
        problems,
        pendingChangedAt: row.pendingChangedAt?.toISOString() ?? null,
    };
}

/** Subscriptions on the plan, or booked to switch to it. */
export async function timesSold(
    db: Db,
    organizationId: string,
    planId: string,
): Promise<number> {
    return db.customerSubscription.count({
        where: {
            organizationId,
            OR: [{ planId }, { pendingPlanId: planId }],
        },
    });
}

/** One plan as the editor reads it; another business's is a 404. */
export async function readPlanEditor(
    organizationId: string,
    id: string,
): Promise<PlanEditorView> {
    const row = await prisma.subscriptionPlan.findFirst({
        where: { id, organizationId },
        select: PLAN_DRAFT_SELECT,
    });
    if (!row) throw new NotFoundException("Plan not found");
    return planEditorView(prisma, organizationId, row);
}
