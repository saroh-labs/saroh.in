import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { bpsToRate, rateToBps } from "../invoices/gst";
import type { GstPriceMode } from "../invoices/gst-price";
import { isGstPriceMode } from "../invoices/gst-price";
import { fromCents, toCents } from "../invoices/totals";
import type { FieldChange } from "./audit-changes";
import { AuditAction, auditMetadata, AuditOutcome } from "./audit.service";

/**
 * Price history (owner, 12 Oct 2026): every change to what a product, one
 * of its options, a service or a course costs is kept, with who made it and
 * when, so the business can see its rate changes.
 *
 * **What is kept.** The typed price, the MRP (a product's and an option's),
 * the GST rate, and "GST on this price" (the item's own way of carrying
 * GST; null is the same as the business). Each entry holds the value before
 * and after for the fields that moved, and nothing when none did. The price
 * is the one that was typed: nothing here works out an amount to pay, so a
 * line reads the same whatever the business's GST setting is today.
 *
 * **Where.** The business's audit stream (`AuditEvent`), written on the
 * transaction of the change itself, so a save that fails or is refused
 * leaves no entry. `price.set` is an item's first entry (it was made, or
 * copied, or imported, at these values); `price.changed` is every later
 * one. The target is the item: `product`, `service` or `course`. An
 * option's entry is on its product and names the option, so a product's
 * history is one read. An operator's change is marked `byOperator`
 * (`auditMetadata`) and reads as Saroh support (DEC-035).
 *
 * **The rates sheet** used to write `gst-rate.set` with one `from` and
 * `to`. It writes `price.changed` now, the same shape as every other way a
 * rate changes; rows already written as `gst-rate.set` are read into that
 * shape by {@link changesOf}, here and in the app's Activity.
 *
 * Membership plans and class packs keep their own histories
 * (`SubscriptionPlanEvent`, `PackEvent`) and are not written here.
 */

type Tx = Pick<Prisma.TransactionClient, "auditEvent">;

export const PRICED_KINDS = ["PRODUCT", "SERVICE", "COURSE"] as const;
export type PricedKind = (typeof PRICED_KINDS)[number];

/** The audit row's `targetType` for each kind. */
export const PRICED_TARGET: Record<PricedKind, string> = {
    PRODUCT: "product",
    SERVICE: "service",
    COURSE: "course",
};

/** The fields a price entry may name, in the order a line says them. */
export const PRICE_FIELDS = [
    "price",
    "mrp",
    "gstRate",
    "gstPriceMode",
] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

/**
 * How the change was made. `rates`: the GST rates sheet or the ask where a
 * payment was stopped for a missing rate. `copy`: Duplicate. `setup`: the
 * first service made when Appointments is turned on.
 */
export type PriceSource = "editor" | "rates" | "import" | "copy" | "setup";

/** Who a change made by no person is recorded as. */
export const PRICE_SYSTEM_ACTOR = "system:prices";

export interface PriceActor {
    organizationId: string;
    userId: string | null;
    /** The acting context's role key: an operator's reads as Saroh support. */
    roleKey?: string;
}

/** What something costs, each value as the stream writes it. */
export interface PriceFacts {
    /** Major units with two decimals: "780.00". Null: none of its own. */
    price: string | null;
    /** Left out for a kind with no MRP (a service, a course). */
    mrp?: string | null;
    /** "18", "0.25"; null is not set. */
    gstRate: string | null;
    /** Null is the same as the business. */
    gstPriceMode: GstPriceMode | null;
}

type Amount = string | { toString(): string } | null | undefined;

/** A stored or typed amount as "780.00"; null when there is none. */
export function moneyFact(amount: Amount): string | null {
    if (amount === null || amount === undefined) return null;
    const text = amount.toString().trim();
    return text === "" ? null : fromCents(toCents(text));
}

/** An amount held in minor units (a service's price) as "780.00". */
export function centsFact(cents: number | null | undefined): string | null {
    return cents === null || cents === undefined ? null : fromCents(cents);
}

/** A stored or typed rate as it is written: "18"; null when not set. */
export function rateFact(rate: Amount): string | null {
    if (rate === null || rate === undefined) return null;
    if (rate.toString().trim() === "") return null;
    const bps = rateToBps(rate);
    return bps === null || Number.isNaN(bps) ? null : bpsToRate(bps);
}

/** An item's own mode; anything else is the same as the business. */
export function modeFact(mode: unknown): GstPriceMode | null {
    return isGstPriceMode(mode) ? mode : null;
}

/** A product row's (or a typed product's) facts. */
export function productFacts(row: {
    price: Amount;
    mrp?: Amount;
    gstRate?: Amount;
    gstPriceMode?: unknown;
}): PriceFacts {
    return {
        price: moneyFact(row.price),
        mrp: moneyFact(row.mrp),
        gstRate: rateFact(row.gstRate),
        gstPriceMode: modeFact(row.gstPriceMode),
    };
}

/**
 * An option's facts: its own price and MRP (null: the product's). Its rate
 * and its mode are the product's, so they never move here.
 */
export function optionFacts(row: { price?: Amount; mrp?: Amount }): PriceFacts {
    return {
        price: moneyFact(row.price),
        mrp: moneyFact(row.mrp),
        gstRate: null,
        gstPriceMode: null,
    };
}

/** A service row's facts: its price is held in minor units. */
export function serviceFacts(row: {
    priceCents?: number | null;
    gstRate?: Amount;
    gstPriceMode?: unknown;
}): PriceFacts {
    return {
        price: centsFact(row.priceCents),
        gstRate: rateFact(row.gstRate),
        gstPriceMode: modeFact(row.gstPriceMode),
    };
}

/** A course row's facts. */
export function courseFacts(row: {
    price: Amount;
    gstRate?: Amount;
    gstPriceMode?: unknown;
}): PriceFacts {
    return {
        price: moneyFact(row.price),
        gstRate: rateFact(row.gstRate),
        gstPriceMode: modeFact(row.gstPriceMode),
    };
}

/**
 * The fields that moved between `before` and `after`, in the order a line
 * says them. With no `before` (the item's first entry) every value it
 * starts with is a change from nothing.
 */
export function priceChanges(
    before: PriceFacts | null,
    after: PriceFacts,
): FieldChange[] {
    const changes: FieldChange[] = [];
    for (const field of PRICE_FIELDS) {
        const now = after[field] ?? null;
        const was = before ? (before[field] ?? null) : null;
        if (was === now) continue;
        changes.push({ field, before: was, after: now });
    }
    return changes;
}

/** The item an entry is about. */
export interface PricedItem {
    kind: PricedKind;
    id: string;
    name: string;
    /** What its amounts are in; null for a service with no price yet. */
    currency: string | null;
    /** A product's option, when the change was to it. */
    option?: { id: string; title: string };
}

/**
 * Record what changed about an item's cost, on the transaction that changed
 * it. `before` is null for the item's first entry. Nothing is written when
 * nothing moved; the answer says whether an entry was.
 */
export async function recordPrices(
    tx: Tx,
    actor: PriceActor,
    item: PricedItem,
    before: PriceFacts | null,
    after: PriceFacts,
    source: PriceSource = "editor",
): Promise<boolean> {
    const changes = priceChanges(before, after);
    if (changes.length === 0) return false;
    await tx.auditEvent.create({
        data: {
            action: before ? AuditAction.PriceChanged : AuditAction.PriceSet,
            actorUserId: actor.userId ?? PRICE_SYSTEM_ACTOR,
            organizationId: actor.organizationId,
            targetType: PRICED_TARGET[item.kind],
            targetId: item.id,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(actor.roleKey, {
                kind: item.kind,
                name: item.name,
                currency: item.currency,
                source,
                ...(item.option ? { option: item.option } : {}),
                changes: changes as unknown as Prisma.InputJsonArray,
            }),
        },
    });
    return true;
}

/** The actions an item's history is made of, the old rates one included. */
export const PRICE_HISTORY_ACTIONS = [
    AuditAction.PriceSet,
    AuditAction.PriceChanged,
    AuditAction.GstRateSet,
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const asText = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value : null;

const KNOWN_FIELDS: ReadonlySet<string> = new Set(PRICE_FIELDS);

/**
 * An entry's changes as recorded. A `gst-rate.set` row (the rates sheet
 * before price history) kept one `from` and `to`: it reads as a change of
 * the GST rate.
 */
export function changesOf(action: string, metadata: unknown): FieldChange[] {
    const meta = asRecord(metadata);
    if (action === AuditAction.GstRateSet) {
        return [
            {
                field: "gstRate",
                before: asText(meta.from),
                after: asText(meta.to),
            },
        ];
    }
    if (!Array.isArray(meta.changes)) return [];
    return meta.changes.flatMap((c): FieldChange[] => {
        const change = asRecord(c);
        return typeof change.field === "string" &&
            KNOWN_FIELDS.has(change.field)
            ? [
                  {
                      field: change.field,
                      before: asText(change.before),
                      after: asText(change.after),
                  },
              ]
            : [];
    });
}

/** Who an entry names. Null (on the entry) is someone no longer here. */
export interface PriceHistoryWho {
    /** Their name now; null when they have none. */
    name: string | null;
    /** A Saroh operator's change: shown as Saroh support, never by name. */
    operator?: true;
    /** No person made it. */
    system?: true;
}

export interface PriceHistoryEntry {
    id: string;
    at: string;
    /** The item's first entry: it started at these values. */
    first: boolean;
    who: PriceHistoryWho | null;
    /** The option the change was to; null for the item itself. */
    option: string | null;
    currency: string | null;
    source: PriceSource | null;
    changes: FieldChange[];
}

export interface PriceHistoryPage {
    entries: PriceHistoryEntry[];
    /** Pass back as `cursor` for the entries before these; null at the end. */
    nextCursor: string | null;
}

const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

const SOURCES: ReadonlySet<string> = new Set([
    "editor",
    "rates",
    "import",
    "copy",
    "setup",
]);

/**
 * One item's entries, newest first, a page at a time. Scoped to the
 * business and to the item; the caller has already checked the reader may
 * see the item and that it is the business's.
 *
 * Reads by `organizationId` and the target, on the stream's
 * `[organizationId, createdAt]` index, as the customer timeline does
 * (`customer-workspace.service.ts`).
 *
 * A name is the person's as it is now, never their email: whoever may read
 * the item reads this, not only who may read the audit log.
 */
export async function readPriceHistory(
    organizationId: string,
    kind: PricedKind,
    id: string,
    options: { limit?: number; cursor?: string } = {},
): Promise<PriceHistoryPage> {
    const take = Math.min(
        Math.max(Math.floor(options.limit ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1),
        MAX_PAGE,
    );
    const rows = await prisma.auditEvent.findMany({
        where: {
            organizationId,
            targetType: PRICED_TARGET[kind],
            targetId: id,
            action: { in: [...PRICE_HISTORY_ACTIONS] },
            outcome: AuditOutcome.Success,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    const operator = (metadata: unknown) =>
        asRecord(metadata).byOperator === true;
    const system = (actorUserId: string) => actorUserId.startsWith("system:");
    const userIds = [
        ...new Set(
            page
                .filter((r) => !operator(r.metadata) && !system(r.actorUserId))
                .map((r) => r.actorUserId),
        ),
    ];
    const users =
        userIds.length > 0
            ? await prisma.user.findMany({
                  where: { id: { in: userIds } },
                  select: { id: true, name: true },
              })
            : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    const who = (row: (typeof page)[number]): PriceHistoryWho | null => {
        if (operator(row.metadata)) {
            return { name: "Saroh support", operator: true };
        }
        if (system(row.actorUserId)) return { name: "Saroh", system: true };
        if (!names.has(row.actorUserId)) return null;
        // A blank name is no name.
        const name = names.get(row.actorUserId)?.trim();
        if (name) return { name };
        return { name: null };
    };
    return {
        entries: page.flatMap((row): PriceHistoryEntry[] => {
            const changes = changesOf(row.action, row.metadata);
            if (changes.length === 0) return [];
            const meta = asRecord(row.metadata);
            const source = asText(meta.source);
            return [
                {
                    id: row.id,
                    at: row.createdAt.toISOString(),
                    first: row.action === AuditAction.PriceSet,
                    who: who(row),
                    option: asText(asRecord(meta.option).title),
                    currency: asText(meta.currency),
                    source:
                        source && SOURCES.has(source)
                            ? (source as PriceSource)
                            : row.action === AuditAction.GstRateSet
                              ? "rates"
                              : null,
                    changes,
                },
            ];
        }),
        nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
}

/** The actor a request's change is recorded as. */
export function priceActor(ctx: {
    organizationId: string;
    userId: string;
    roleKey?: string;
}): PriceActor {
    return {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
    };
}
