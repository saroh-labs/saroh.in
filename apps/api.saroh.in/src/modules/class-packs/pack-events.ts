import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { DraftValue } from "../../common/drafts/draft-record";
import { sameValue } from "../../common/drafts/draft-record";
import type { OrganizationContext } from "../../common/types/organization-context";
import { contactName } from "../invoices/serialize";
import type {
    EventActor,
    EventActorKind,
    EventActorView,
} from "../subscriptions/event-actors";
import {
    actorFromContext,
    actorView,
    teamNames,
} from "../subscriptions/event-actors";
import { PACK_EVENTS_PAGE_MAX } from "./dto";
import type { PackValues } from "./pack-draft-view";
import { PACK_DRAFT_FIELDS } from "./pack-draft-view";

/**
 * A class pack's history (round-2 E13), read by Pack Detail's Activity tab
 * (E17): one event for each thing done to the pack, written in the same
 * transaction as the change, with who did it. Append-only: this file writes
 * rows and reads them; nothing updates or deletes one. Draft autosaves
 * record nothing; what they end up as is recorded when it is published.
 *
 * Who did it follows the plan and subscription logs (`event-actors.ts`): a
 * teammate by name, a Saroh operator as Saroh support (DEC-035), a customer
 * buying on the site (A11) as CUSTOMER.
 */

export const PACK_EVENT_KINDS = [
    /** Made, as a pack on sale (the old form) or as a draft (the editor). */
    "CREATED",
    /** A draft put on sale. */
    "PUBLISHED",
    /** Its terms changed: `{ field: [before, after] }`. */
    "CHANGED",
    /** Sold to someone: the price and how it was paid. */
    "SOLD",
    /** A holder's use-by date moved on. */
    "EXTENDED",
    "ARCHIVED",
    /** Sold again after being archived. */
    "RESTORED",
] as const;
export type PackEventKind = (typeof PACK_EVENT_KINDS)[number];

export type PackField = (typeof PACK_DRAFT_FIELDS)[number];

/** `{ field: [before, after] }`, only the fields that changed. */
export type PackChanges = Partial<Record<PackField, [DraftValue, DraftValue]>>;

/** A sale, as its event keeps it. */
export interface PackSaleDetails {
    price: string;
    currency: string;
    credits: number;
    paidBy: string | null;
}

/** An extension, as its event keeps it. */
export interface PackExtensionDetails {
    days: number;
    reason: string;
    expiresAt: [string, string];
}

export type PackEventDetails =
    | PackChanges
    | PackSaleDetails
    | PackExtensionDetails
    | Record<string, never>;

/** The fields that differ between two sets of values, each `[before, after]`. */
export function diffPack(
    before: PackValues | null,
    after: PackValues,
): PackChanges {
    const changes: PackChanges = {};
    for (const field of PACK_DRAFT_FIELDS) {
        const was = before ? before[field] : null;
        const now = after[field];
        if (!sameValue(was, now)) changes[field] = [was, now];
    }
    return changes;
}

export type PackActor = EventActor<EventActorKind>;

/** Who a request's change is recorded as (DEC-035 for operators). */
export function packActor(ctx: OrganizationContext): PackActor {
    return actorFromContext(ctx);
}

/** Write one event, inside the change's own transaction. */
export async function recordPackEvent(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        packId: string;
        kind: PackEventKind;
        actor: PackActor;
        purchaseId?: string | null;
        details?: PackEventDetails;
    },
): Promise<void> {
    await tx.packEvent.create({
        data: {
            organizationId: input.organizationId,
            packId: input.packId,
            purchaseId: input.purchaseId ?? null,
            kind: input.kind,
            actorKind: input.actor.actorKind,
            actorUserId: input.actor.actorUserId,
            details: (input.details ?? {}) as Prisma.InputJsonObject,
        },
    });
}

/**
 * Record a change of terms: one CHANGED event when anything recorded
 * differs, none otherwise. Returns whether it wrote one.
 */
export async function recordPackChange(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        packId: string;
        actor: PackActor;
        before: PackValues;
        after: PackValues;
    },
): Promise<boolean> {
    const changes = diffPack(input.before, input.after);
    if (Object.keys(changes).length === 0) return false;
    await recordPackEvent(tx, {
        organizationId: input.organizationId,
        packId: input.packId,
        kind: "CHANGED",
        actor: input.actor,
        details: changes,
    });
    return true;
}

// — Reading ——————————————————————————————————————————————————————————

export const PACK_EVENTS_PAGE = 50;

export interface PackEventView {
    id: string;
    kind: PackEventKind;
    /** What happened; its shape follows the kind (see the model). */
    details: PackEventDetails;
    /** The holder a SOLD or EXTENDED event is about; null once removed. */
    holder: { purchaseId: string; contactId: string; name: string } | null;
    /** Who did it, named as `event-actors.ts` says. */
    actor: EventActorView;
    createdAt: string;
}

export interface PackEventsPage {
    /** Newest first. */
    events: PackEventView[];
    /** The last event's id on this page, to ask for the next; null at the end. */
    nextCursor: string | null;
    /**
     * The pack was made before its history was kept (E13), so the oldest
     * event isn't its creation: "Earlier changes weren't recorded".
     */
    earlierUnrecorded: boolean;
}

/**
 * A pack's events, newest first, paged by the last event's id. The caller
 * has found the pack in this business; a cursor that isn't one of its
 * events is refused before anything is read.
 */
export async function listPackEvents(
    organizationId: string,
    packId: string,
    options: { cursor?: string; limit?: number } = {},
): Promise<PackEventsPage> {
    const take = Math.min(
        Math.max(options.limit ?? PACK_EVENTS_PAGE, 1),
        PACK_EVENTS_PAGE_MAX,
    );
    const mine = { organizationId, packId };
    let after: Prisma.PackEventWhereInput = {};
    if (options.cursor) {
        const from = await prisma.packEvent.findFirst({
            where: { ...mine, id: options.cursor },
            select: { id: true, createdAt: true },
        });
        if (!from) {
            throw new BadRequestException({
                message: "That page of the activity isn't there any more",
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
        prisma.packEvent.findMany({
            where: { ...mine, ...after },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: take + 1,
            select: {
                id: true,
                kind: true,
                actorKind: true,
                actorUserId: true,
                details: true,
                createdAt: true,
                purchase: {
                    select: {
                        id: true,
                        contact: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        }),
        prisma.packEvent.findFirst({
            where: { ...mine, kind: "CREATED" },
            select: { id: true },
        }),
    ]);
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const names = await teamNames(page);

    return {
        events: page.map((e) => ({
            id: e.id,
            kind: e.kind as PackEventKind,
            details: (e.details ?? {}) as PackEventDetails,
            holder: e.purchase
                ? {
                      purchaseId: e.purchase.id,
                      contactId: e.purchase.contact.id,
                      name: contactName(e.purchase.contact),
                  }
                : null,
            actor: actorView(
                e.actorKind as EventActorKind,
                e.actorUserId,
                names,
            ),
            createdAt: e.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
        earlierUnrecorded: !created,
    };
}
