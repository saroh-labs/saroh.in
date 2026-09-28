import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { DraftPatch } from "../../common/drafts/draft-record";
import {
    assertRevision,
    mergeForEditor,
    readPending,
} from "../../common/drafts/draft-record";
import { toMinor, toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { PACK_DRAFT } from "./pack-on-sale";

/**
 * A pack as the Pack Editor reads it (round-2 E14, D5's rules for plans):
 * the values it shows, what is live, whether it holds unpublished changes,
 * the revision every save carries, and what stops it being published. The
 * shapes are the editor shell's `EditorRecord`
 * (`apps/app.saroh.in/lib/editor-shell/types.ts`).
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The fields a pack's draft holds; nothing else is published. E13 adds the
 * kind and "first pack only" here, and owns the kind's lock at publish.
 */
export const PACK_DRAFT_FIELDS = [
    "name",
    "description",
    "credits",
    "validityDays",
    "price",
    "currency",
    "serviceIds",
] as const;

/**
 * A pack's publishable values, as the editor sends and shows them. `price`
 * is "4500.00". On a draft, a number or price not set yet is null (stored
 * as 0, since the columns can't be empty). `serviceIds` is sorted.
 */
export interface PackValues {
    name: string;
    description: string | null;
    credits: number | null;
    validityDays: number | null;
    price: string | null;
    currency: string;
    serviceIds: string[];
}

/** A reason the pack can't be published yet, beside its field. */
export interface PackProblem {
    field: string;
    message: string;
}

export interface PackEditorView {
    id: string;
    status: string;
    /** A live pack holds a set of unpublished changes. */
    hasPendingChanges: boolean;
    /** Sent back with every save, publish, discard and delete (#285). */
    revision: number;
    /** What the editor shows: a draft's columns, or live with pending over. */
    values: PackValues;
    /** What is live now; null for a draft. */
    published: PackValues | null;
    /** A draft nobody has bought, so Delete draft is allowed. */
    canDelete: boolean;
    /** What stops Publish now. Empty when it can be published. */
    problems: PackProblem[];
    /** When the draft or the pending set was last saved; null when none. */
    pendingChangedAt: string | null;
}

export const PACK_DRAFT_SELECT = {
    id: true,
    status: true,
    name: true,
    description: true,
    credits: true,
    validityDays: true,
    price: true,
    currency: true,
    pendingChanges: true,
    pendingChangedAt: true,
    draftRevision: true,
    revisedAt: true,
    revisedById: true,
    services: { select: { serviceId: true } },
} as const;

export type PackDraftRow = Prisma.ClassPackGetPayload<{
    select: typeof PACK_DRAFT_SELECT;
}>;

/** A set of service ids as a pack's values hold them: unique and sorted. */
export function serviceSet(ids: readonly string[]): string[] {
    return [...new Set(ids)].sort();
}

/** The pack's columns as values: what is live, or a draft's own. */
export function columnValues(row: PackDraftRow): PackValues {
    const draft = row.status === PACK_DRAFT;
    const unset = (n: number) => (draft && n === 0 ? null : n);
    return {
        name: row.name,
        description: row.description,
        credits: unset(row.credits),
        validityDays: unset(row.validityDays),
        price:
            draft && toMinor(row.price) === 0 ? null : toMoneyString(row.price),
        currency: row.currency,
        serviceIds: serviceSet(row.services.map((s) => s.serviceId)),
    };
}

export function pendingOf(row: PackDraftRow): DraftPatch<PackValues> | null {
    if (row.status === PACK_DRAFT) return null;
    return readPending<PackValues>(PACK_DRAFT_FIELDS, row.pendingChanges);
}

/** What the editor shows: a draft's columns, or live with pending over. */
export function editorValues(row: PackDraftRow): PackValues {
    return mergeForEditor(columnValues(row), pendingOf(row));
}

/** Values as the columns take them. A number or price not set is stored as 0. */
export function valueColumns(values: PackValues) {
    return {
        name: values.name,
        description: values.description,
        credits: values.credits ?? 0,
        validityDays: values.validityDays ?? 0,
        price: values.price ?? "0",
        currency: values.currency,
    };
}

/**
 * Who moved the revision: a teammate, stored by id; a Saroh operator is
 * never stored (DEC-035), so a save with a time and no person is theirs.
 */
export function revisedBy(ctx: OrganizationContext): string | null {
    return ctx.roleKey === PLATFORM_OPERATOR_ROLE_KEY ? null : ctx.userId;
}

/** Every pack write moves the revision, naming who did it and when. */
export function revised(ctx: OrganizationContext) {
    return {
        draftRevision: { increment: 1 },
        revisedAt: new Date(),
        revisedById: revisedBy(ctx),
    };
}

/** Take the pack's row lock for the rest of the transaction. */
export async function lockPack(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "ClassPack" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
}

/**
 * What stops these values being published: a name, how many classes, how
 * long it is valid, a price above zero, and at least one service still
 * offered. The DTO has already checked each field's shape and range; E13
 * adds its own rules (validity of at least 7 days, the kind lock).
 */
export async function packProblems(
    db: Db,
    organizationId: string,
    values: PackValues,
): Promise<PackProblem[]> {
    const problems: PackProblem[] = [];
    if (!values.name.trim()) {
        problems.push({ field: "name", message: "Give the pack a name" });
    }
    if (values.credits === null) {
        problems.push({
            field: "credits",
            message: "Say how many classes it holds",
        });
    }
    if (values.validityDays === null) {
        problems.push({
            field: "validityDays",
            message: "Say how long it is valid",
        });
    }
    if (!values.price || toMinor(values.price) === 0) {
        problems.push({ field: "price", message: "Set a price" });
    }
    if (values.serviceIds.length === 0) {
        problems.push({
            field: "serviceIds",
            message: "Choose the classes it pays for",
        });
    } else {
        const offered = await db.service.count({
            where: {
                id: { in: values.serviceIds },
                organizationId,
                deletedAt: null,
            },
        });
        if (offered !== values.serviceIds.length) {
            problems.push({
                field: "serviceIds",
                message:
                    "A class it pays for has been deleted. Choose its classes again.",
            });
        }
    }
    return problems;
}

/** How an operator's save is named, as the other logs name them. */
const SAROH_SUPPORT = "Saroh support";

/**
 * Refuse (409) a write from an editor holding an older revision, naming who
 * moved it since by display name. Nothing is read for a current one.
 */
export async function checkPackRevision(
    db: Db,
    row: PackDraftRow,
    yours: number,
): Promise<void> {
    if (yours === row.draftRevision) return;
    let changedBy: string | null = null;
    if (row.revisedAt) {
        if (!row.revisedById) {
            changedBy = SAROH_SUPPORT;
        } else {
            const user = await db.user.findUnique({
                where: { id: row.revisedById },
                select: { name: true },
            });
            changedBy = user?.name ?? null;
        }
    }
    assertRevision(
        yours,
        {
            revision: row.draftRevision,
            changedBy,
            changedAt: row.revisedAt,
        },
        "pack",
    );
}

/** Times the pack has been sold. A draft never has been. */
export async function timesSold(
    db: Db,
    organizationId: string,
    packId: string,
): Promise<number> {
    return db.packPurchase.count({ where: { organizationId, packId } });
}

/** The editor's view of a pack row. */
export async function packEditorView(
    db: Db,
    organizationId: string,
    row: PackDraftRow,
): Promise<PackEditorView> {
    const isDraft = row.status === PACK_DRAFT;
    const values = editorValues(row);
    const [problems, sold] = await Promise.all([
        packProblems(db, organizationId, values),
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

/** One pack as the editor reads it; another business's is a 404. */
export async function readPackEditor(
    organizationId: string,
    id: string,
): Promise<PackEditorView> {
    const row = await prisma.classPack.findFirst({
        where: { id, organizationId },
        select: PACK_DRAFT_SELECT,
    });
    if (!row) throw new NotFoundException("Class pack not found");
    return packEditorView(prisma, organizationId, row);
}
