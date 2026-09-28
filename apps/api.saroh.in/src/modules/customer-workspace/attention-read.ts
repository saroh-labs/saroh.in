import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allows } from "../organizations/organization-policy";
import { allergenKey, allergensByName } from "./allergen-match";
import type { AttentionKind } from "./dto";

/**
 * Needs attention, read (DEC-040, C1). The one place that decides which
 * entries a viewer sees: Customer Detail, orders (B15), bookings (E4), Home
 * (F2) and the kitchen view all call `attentionFor`, and none filters on its
 * own.
 *
 * A sensitive entry (Medical by default) goes only to someone who may see
 * sensitive entries. Everyone else gets how many they can't see
 * (`hiddenSensitiveCount`), never what they say — so a screen can write
 * "1 more note you can't see".
 *
 * The caller has already checked the viewer may read the person (the detail
 * needs `contact:read`; an order surface its own read). This helper decides
 * only what inside the list they may see.
 */

export type AttentionSource = "STAFF" | "BOOKING_PAGE" | "CUSTOMER";
export type AttentionStatus = "SUGGESTED" | "ACTIVE";

export interface AttentionEntryView {
    id: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    /** The allergen an Allergy entry names, from the business's list. */
    allergen: { id: string; name: string } | null;
    /**
     * What an order is checked against: the allergen's id and every other
     * allergen of the same name in the business, as a note's
     * `matchAllergens`. Empty for an entry that names none.
     */
    matchAllergens: { id: string; name: string }[];
    source: AttentionSource;
    status: AttentionStatus;
    bookingId: string | null;
    createdByUserId: string | null;
    /** Who added it, by name; null for the booking page, the customer, or a
     * teammate with no name. */
    addedBy: string | null;
    confirmedByUserId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AttentionRead {
    entries: AttentionEntryView[];
    /** Entries on the record this viewer may not see. */
    hiddenSensitiveCount: number;
}

/**
 * Whether this viewer sees sensitive entries: `customer:sensitive` (C13,
 * permission matrix Q2), held by Owner and Admin by default and grantable to
 * a practitioner. Not implied by `contact:write`, so a front desk that edits
 * a patient's details still doesn't read their medical notes. Every surface
 * that shows Needs attention or an intake note asks this one seam.
 */
export function canSeeSensitive(ctx: OrganizationContext): boolean {
    return allows(ctx, "customer:sensitive");
}

export const ATTENTION_SELECT = {
    id: true,
    contactId: true,
    kind: true,
    label: true,
    detail: true,
    sensitive: true,
    source: true,
    status: true,
    bookingId: true,
    createdByUserId: true,
    confirmedByUserId: true,
    createdAt: true,
    updatedAt: true,
    allergen: { select: { id: true, name: true } },
} as const;

export interface AttentionRow {
    id: string;
    contactId: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    source: AttentionSource;
    status: AttentionStatus;
    bookingId: string | null;
    createdByUserId: string | null;
    confirmedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    allergen: { id: string; name: string } | null;
}

/** Allergy first, then Medical, Access, Other; oldest first within a kind. */
const KIND_ORDER: Record<AttentionKind, number> = {
    ALLERGY: 0,
    MEDICAL: 1,
    ACCESS: 2,
    OTHER: 3,
};

/**
 * Rows made into what a screen reads, with who added them and the allergens
 * an order is matched on. `db` reads the names and the allergen list.
 */
export async function attentionViews(
    db: typeof prisma,
    organizationId: string,
    rows: AttentionRow[],
): Promise<AttentionEntryView[]> {
    if (rows.length === 0) return [];
    const userIds = [
        ...new Set(
            rows.map((r) => r.createdByUserId).filter((id) => id !== null),
        ),
    ];
    const [users, byName] = await Promise.all([
        userIds.length
            ? db.user.findMany({
                  where: { id: { in: userIds } },
                  select: { id: true, name: true },
              })
            : Promise.resolve([]),
        rows.some((r) => r.allergen)
            ? allergensByName(db, organizationId)
            : Promise.resolve(
                  new Map<string, { id: string; name: string }[]>(),
              ),
    ]);
    const names = new Map(
        users.map((u) => [u.id, u.name?.trim() ? u.name.trim() : null]),
    );
    return [...rows]
        .sort(
            (a, b) =>
                KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
                a.createdAt.getTime() - b.createdAt.getTime() ||
                a.id.localeCompare(b.id),
        )
        .map((r) => {
            const matches = new Map<string, { id: string; name: string }>();
            if (r.allergen) {
                matches.set(r.allergen.id, r.allergen);
                for (const same of byName.get(allergenKey(r.allergen.name)) ??
                    [])
                    matches.set(same.id, same);
            }
            return {
                id: r.id,
                kind: r.kind,
                label: r.label,
                detail: r.detail,
                sensitive: r.sensitive,
                allergen: r.allergen,
                matchAllergens: [...matches.values()],
                source: r.source,
                status: r.status,
                bookingId: r.bookingId,
                createdByUserId: r.createdByUserId,
                addedBy: r.createdByUserId
                    ? (names.get(r.createdByUserId) ?? null)
                    : null,
                confirmedByUserId: r.confirmedByUserId,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
            };
        });
}

/**
 * The active Needs attention entries of each contact this viewer may see,
 * keyed by contact id. Every id asked for has an answer, empty when the
 * contact has none (or is in another organization).
 */
export async function attentionFor(
    ctx: OrganizationContext,
    contactIds: string[],
    db: typeof prisma = prisma,
): Promise<Map<string, AttentionRead>> {
    const ids = [...new Set(contactIds)];
    const out = new Map<string, AttentionRead>(
        ids.map((id) => [id, { entries: [], hiddenSensitiveCount: 0 }]),
    );
    if (ids.length === 0) return out;

    const sensitiveToo = canSeeSensitive(ctx);
    const rows = (await db.contactAttention.findMany({
        where: {
            organizationId: ctx.organizationId,
            contactId: { in: ids },
            status: "ACTIVE",
            removedAt: null,
            // A sensitive entry's words never leave the database for a
            // viewer who may not read them.
            ...(sensitiveToo ? {} : { sensitive: false }),
        },
        select: ATTENTION_SELECT,
    })) as AttentionRow[];

    if (!sensitiveToo) {
        const hidden = await db.contactAttention.groupBy({
            by: ["contactId"],
            where: {
                organizationId: ctx.organizationId,
                contactId: { in: ids },
                status: "ACTIVE",
                removedAt: null,
                sensitive: true,
            },
            _count: { _all: true },
        });
        for (const h of hidden) {
            const read = out.get(h.contactId);
            if (read) read.hiddenSensitiveCount = h._count._all;
        }
    }

    const views = await attentionViews(db, ctx.organizationId, rows);
    const contactOf = new Map(rows.map((r) => [r.id, r.contactId]));
    for (const v of views) {
        const contactId = contactOf.get(v.id);
        const read = contactId ? out.get(contactId) : undefined;
        if (read) read.entries.push(v);
    }
    return out;
}

/**
 * Suggestions waiting for staff (a booking-page note, the customer's own
 * note): shown only to someone who can add them to the record, and a
 * sensitive one only to someone who may read it. A booking-page note counts
 * as sensitive until staff confirm it (default 95), so the writer sets it.
 */
export async function attentionSuggestionsFor(
    ctx: OrganizationContext,
    contactId: string,
    db: typeof prisma = prisma,
): Promise<AttentionEntryView[] | undefined> {
    if (!allows(ctx, "contact:write")) return undefined;
    const rows = (await db.contactAttention.findMany({
        where: {
            organizationId: ctx.organizationId,
            contactId,
            status: "SUGGESTED",
            removedAt: null,
            ...(canSeeSensitive(ctx) ? {} : { sensitive: false }),
        },
        select: ATTENTION_SELECT,
    })) as AttentionRow[];
    return attentionViews(db, ctx.organizationId, rows);
}
