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
    sameValue,
} from "../../common/drafts/draft-record";
import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { businessCurrency } from "../stores/currency";
import type { PackDraftDto, PackInputDto } from "./dto";
import type { PackDraftRow, PackValues } from "./pack-draft-view";
import {
    checkPackRevision,
    columnValues,
    lockPack,
    PACK_DRAFT_FIELDS,
    PACK_DRAFT_SELECT,
    packProblems,
    pendingOf,
    revised,
    revisedBy,
    serviceSet,
    timesSold,
    valueColumns,
} from "./pack-draft-view";
import { PACK_DRAFT, PACK_ON_SALE } from "./pack-on-sale";

/**
 * The Pack Editor's writes (round-2 E14, on D5's shared draft rules). A new
 * pack starts as a DRAFT, which nobody can buy. A live pack's edits go to a
 * pending set beside its published columns and services, which sales keep
 * reading until someone publishes; every purchase keeps the terms it was
 * sold with whatever is published later (PackPurchase stores them).
 *
 * Every write takes the pack's row lock, then checks the revision the
 * editor holds (a stale one is a 409 naming who saved since, and nothing is
 * written), then bumps it. Publish checks the pack as a whole. The service
 * authorizes and reads the pack back for the editor.
 */

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function refuse(message: string, field = "status"): never {
    throw new ConflictException({ message, details: { field } });
}

const ARCHIVED_REFUSAL =
    "This pack is archived. Sell it again before changing it.";

/** Read the pack under its row lock. */
async function lockedRow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
): Promise<PackDraftRow> {
    await lockPack(tx, organizationId, id);
    const row = await tx.classPack.findFirst({
        where: { id, organizationId },
        select: PACK_DRAFT_SELECT,
    });
    if (!row) throw new NotFoundException("Class pack not found");
    return row;
}

/**
 * Every service id belongs to this business and is still offered, or it is
 * a 404 on the field. Answers the set as a pack's values hold it.
 */
export async function assertPackServices(
    db: Prisma.TransactionClient | typeof prisma,
    organizationId: string,
    ids: readonly string[],
): Promise<string[]> {
    const unique = serviceSet(ids);
    if (unique.length === 0) return unique;
    const found = await db.service.count({
        where: { id: { in: unique }, organizationId, deletedAt: null },
    });
    if (found !== unique.length) {
        throw new NotFoundException({
            message: "One of those services was not found",
            details: { field: "serviceIds" },
        });
    }
    return unique;
}

/**
 * The editor's fields as values: money as "4500.00", services as a sorted
 * set of this business's ids. A name or currency can't be emptied; a
 * number, a price or the services can (a draft not finished yet).
 */
async function patchOf(
    organizationId: string,
    dto: PackInputDto,
): Promise<DraftPatch<PackValues>> {
    // The DTO's @IsOptional lets an explicit null through every field.
    const sent = dto as Record<string, unknown>;
    if (sent.name === null) fieldError("Give the pack a name", "name");
    if (sent.currency === null) fieldError("Choose a currency", "currency");
    const patch = pickPatch<PackValues>(PACK_DRAFT_FIELDS, sent);
    if (typeof patch.price === "string") {
        patch.price = toMoneyString(patch.price);
    }
    if (patch.serviceIds !== undefined) {
        patch.serviceIds = await assertPackServices(
            prisma,
            organizationId,
            patch.serviceIds ?? [],
        );
    }
    return patch;
}

/** Point the pack at exactly these services, when they differ. */
async function writeServices(
    tx: Prisma.TransactionClient,
    organizationId: string,
    packId: string,
    before: readonly string[],
    after: readonly string[],
): Promise<void> {
    if (sameValue(before, after)) return;
    await tx.classPackService.deleteMany({ where: { packId, organizationId } });
    if (after.length === 0) return;
    await tx.classPackService.createMany({
        data: after.map((serviceId) => ({
            packId,
            serviceId,
            organizationId,
        })),
    });
}

/**
 * The first autosave of a new pack, which has a name: a DRAFT. Whatever
 * else isn't given yet is a placeholder the editor shows as unset (the
 * numbers and price) or as its default (the business's currency).
 */
export async function createPackDraft(
    ctx: OrganizationContext,
    dto: PackInputDto,
): Promise<string> {
    const { organizationId } = ctx;
    const name = dto.name;
    if (!name) fieldError("Give the pack a name", "name");
    const patch = await patchOf(organizationId, dto);
    return prisma.$transaction(async (tx) => {
        const currency =
            patch.currency ??
            (await businessCurrency(tx, organizationId)) ??
            "INR";
        const values: PackValues = {
            name,
            description: patch.description ?? null,
            credits: patch.credits ?? null,
            validityDays: patch.validityDays ?? null,
            price: patch.price ?? null,
            currency,
            serviceIds: patch.serviceIds ?? [],
        };
        const now = new Date();
        // Revision 0: the editor's first answer carries it.
        const pack = await tx.classPack.create({
            data: {
                organizationId,
                ...valueColumns(values),
                status: PACK_DRAFT,
                pendingChangedAt: now,
                revisedAt: now,
                revisedById: revisedBy(ctx),
            },
            select: { id: true },
        });
        await writeServices(tx, organizationId, pack.id, [], values.serviceIds);
        return pack.id;
    });
}

/**
 * Autosave. A DRAFT's columns and services are written directly (nothing is
 * live). A live pack's go to its pending set, holding only what differs
 * from what is live. A save that changes nothing writes nothing and keeps
 * the revision.
 */
export async function savePackDraft(
    ctx: OrganizationContext,
    id: string,
    dto: PackDraftDto,
): Promise<void> {
    const { organizationId } = ctx;
    const patch = await patchOf(organizationId, dto);
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status !== PACK_DRAFT && row.status !== PACK_ON_SALE) {
            refuse(ARCHIVED_REFUSAL);
        }
        await checkPackRevision(tx, row, dto.revision);
        const saved = { ...revised(ctx), pendingChangedAt: new Date() };

        if (row.status === PACK_DRAFT) {
            const before = columnValues(row);
            const after = { ...before, ...patch };
            if (
                !Object.keys(diffValues(PACK_DRAFT_FIELDS, before, after))
                    .length
            ) {
                return;
            }
            await tx.classPack.updateMany({
                where: { id, organizationId },
                data: { ...valueColumns(after), ...saved },
            });
            await writeServices(
                tx,
                organizationId,
                id,
                before.serviceIds,
                after.serviceIds,
            );
            return;
        }

        const held = pendingOf(row);
        const next = nextPending(
            PACK_DRAFT_FIELDS,
            columnValues(row),
            held,
            patch,
        );
        if (samePending(held, next)) return;
        await tx.classPack.updateMany({
            where: { id, organizationId },
            data: next
                ? { pendingChanges: next as Prisma.InputJsonObject, ...saved }
                : {
                      // Every change was put back as it is live: none left.
                      ...revised(ctx),
                      pendingChanges: Prisma.DbNull,
                      pendingChangedAt: null,
                  },
        });
    });
}

/** Clears a pack's pending set, once published or discarded. */
const CLEARED = {
    pendingChanges: Prisma.DbNull,
    pendingChangedAt: null,
};

/**
 * Publish a DRAFT (it goes on sale), or a live pack's pending changes (they
 * become its terms for new sales; everyone who bought one keeps theirs,
 * ADR-007). Checked as a whole first: anything missing is a 409 on its
 * field and nothing is published. A live pack with nothing pending
 * publishes nothing.
 */
export async function publishPack(
    ctx: OrganizationContext,
    id: string,
    revision: number,
): Promise<void> {
    const { organizationId } = ctx;
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status !== PACK_DRAFT && row.status !== PACK_ON_SALE) {
            refuse(ARCHIVED_REFUSAL);
        }
        await checkPackRevision(tx, row, revision);

        const live = columnValues(row);
        const held = pendingOf(row);
        const isDraft = row.status === PACK_DRAFT;
        if (!isDraft && !held) return;
        const target = isDraft ? live : mergeForEditor(live, held);

        const problems = await packProblems(tx, organizationId, target);
        if (problems.length) refuse(problems[0].message, problems[0].field);

        await tx.classPack.updateMany({
            where: { id, organizationId },
            data: {
                ...valueColumns(target),
                status: PACK_ON_SALE,
                ...CLEARED,
                ...revised(ctx),
            },
        });
        await writeServices(
            tx,
            organizationId,
            id,
            live.serviceIds,
            target.serviceIds,
        );
    });
}

/**
 * Drop a live pack's unpublished changes; what is live stays. A draft has
 * nothing live to go back to (Delete draft is its way out).
 */
export async function discardPackChanges(
    ctx: OrganizationContext,
    id: string,
    revision: number,
): Promise<void> {
    const { organizationId } = ctx;
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status === PACK_DRAFT) {
            refuse(
                "A draft has nothing published to go back to. Delete the draft instead.",
            );
        }
        await checkPackRevision(tx, row, revision);
        if (!pendingOf(row)) return;
        await tx.classPack.updateMany({
            where: { id, organizationId },
            data: { ...CLEARED, ...revised(ctx) },
        });
    });
}

/**
 * Delete a DRAFT nobody has bought. Its services go with it. A published
 * pack is archived instead.
 */
export async function deletePackDraft(
    ctx: OrganizationContext,
    id: string,
    revision: number,
): Promise<void> {
    const { organizationId } = ctx;
    await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, organizationId, id);
        if (row.status !== PACK_DRAFT) {
            refuse(
                "Only a draft can be deleted. Archive this pack to stop selling it.",
            );
        }
        await checkPackRevision(tx, row, revision);
        if ((await timesSold(tx, organizationId, id)) > 0) {
            refuse("This pack has been sold, so it can't be deleted.");
        }
        await tx.classPack.deleteMany({ where: { id, organizationId } });
    });
}
