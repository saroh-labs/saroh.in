import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type {
    AttentionRead,
    AttentionSource,
} from "../customer-workspace/attention-read";
import { attentionFor } from "../customer-workspace/attention-read";
import type { AttentionKind } from "../customer-workspace/dto";

/**
 * A customer's Needs attention on their orders (B15, R17): the Orders list's
 * tag and filter, the quick view and Order Detail — the kitchen's view
 * included, since an Allergy entry is kitchen data.
 *
 * What a viewer sees is decided once, by C1's `attentionFor`: a sensitive
 * entry (Medical by default) goes only to someone who may see sensitive
 * entries, and for anyone else it is left out by the API — it sets no tag
 * and matches no filter. Whoever may read the order may read the rest; the
 * order surfaces check that first (`order:read` or `order:stage`).
 *
 * An order reaches a person through its store customer's identity links
 * (`CustomerIdentityLink`, C2): an unlinked customer has no Needs attention.
 * Every link counts, so the tag, the filter and the read agree for someone
 * linked twice.
 */

/** One entry as an order read carries it: what it says, never who wrote it. */
export interface OrderAttentionEntry {
    id: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    /** The allergen an Allergy entry names, from the business's list. */
    allergen: { id: string; name: string } | null;
    /**
     * What the order's lines are checked against: the allergen's id and
     * every other allergen of the same name in the business.
     */
    matchAllergens: { id: string; name: string }[];
    /** Where it came from: staff, the booking page or the customer. */
    source: AttentionSource;
}

export interface OrderAttention {
    entries: OrderAttentionEntry[];
    /** Entries on the person this viewer may not see ("1 more note"). */
    hiddenSensitiveCount: number;
}

/** The row's tag: an entry's kind and words, enough for "Allergy: Peanuts". */
export interface OrderAttentionTag {
    id: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    source: AttentionSource;
}

const NONE: OrderAttention = { entries: [], hiddenSensitiveCount: 0 };

function orderEntry(e: AttentionRead["entries"][number]): OrderAttentionEntry {
    return {
        id: e.id,
        kind: e.kind,
        label: e.label,
        detail: e.detail,
        sensitive: e.sensitive,
        allergen: e.allergen,
        matchAllergens: e.matchAllergens,
        source: e.source,
    };
}

/**
 * The Needs attention each store customer's person has, as this viewer may
 * see it, keyed by customer id. Every id asked for has an answer, empty
 * when the customer is linked to no one.
 */
export async function attentionByCustomer(
    ctx: OrganizationContext,
    customerIds: string[],
    db: typeof prisma = prisma,
): Promise<Map<string, OrderAttention>> {
    const ids = [...new Set(customerIds)];
    const out = new Map<string, OrderAttention>(ids.map((id) => [id, NONE]));
    if (ids.length === 0) return out;

    const links = await db.customerIdentityLink.findMany({
        where: { organizationId: ctx.organizationId, customerId: { in: ids } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { customerId: true, contactId: true },
    });
    if (links.length === 0) return out;
    const reads = await attentionFor(
        ctx,
        links.map((l) => l.contactId),
        db,
    );

    for (const id of ids) {
        const contacts = [
            ...new Set(
                links
                    .filter((l) => l.customerId === id)
                    .map((l) => l.contactId),
            ),
        ];
        const seen = new Set<string>();
        const entries: OrderAttentionEntry[] = [];
        let hidden = 0;
        for (const contactId of contacts) {
            const read = reads.get(contactId);
            if (!read) continue;
            hidden += read.hiddenSensitiveCount;
            for (const e of read.entries) {
                if (seen.has(e.id)) continue;
                seen.add(e.id);
                entries.push(orderEntry(e));
            }
        }
        out.set(id, { entries, hiddenSensitiveCount: hidden });
    }
    return out;
}

/** The row's tags: what each entry this viewer may see says. */
export function attentionTags(read: OrderAttention): OrderAttentionTag[] {
    return read.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        detail: e.detail,
        source: e.source,
    }));
}

/**
 * The Needs attention filter in SQL (`o` is the order): its customer's
 * person has an active entry this viewer may see. A sensitive-only person
 * matches nothing for a viewer who may not read sensitive entries, so the
 * filter can't be used to learn that they have one.
 */
export function attentionSql(sensitiveToo: boolean): Prisma.Sql {
    const visible = sensitiveToo
        ? Prisma.sql`TRUE`
        : Prisma.sql`NOT a.sensitive`;
    return Prisma.sql`EXISTS (
        SELECT 1 FROM "CustomerIdentityLink" l
        JOIN "ContactAttention" a
            ON a."contactId" = l."contactId"
           AND a."organizationId" = l."organizationId"
        WHERE l."customerId" = o."customerId"
          AND l."organizationId" = o."organizationId"
          AND a.status::text = 'ACTIVE'
          AND a."removedAt" IS NULL
          AND ${visible}
    )`;
}
