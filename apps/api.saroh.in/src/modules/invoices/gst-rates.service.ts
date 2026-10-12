import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import type { OrgAction } from "../organizations/organization-actions";
import { allows, authorize } from "../organizations/organization-policy";
import { actorFromContext } from "../subscriptions/event-actors";
import { bpsToRate, isGstRate, rateToBps } from "./gst";
import type { GstPriceMode } from "./gst-price";
import { businessPriceMode, isGstPriceMode } from "./gst-price";
import type { RatedKind, SetGstRatesDto } from "./gst-rates.dto";
import { loadTaxProfile } from "./order-invoicing";
import { fromCents, toCents } from "./totals";

/**
 * What a business sells that has no GST rate chosen, and the way to choose
 * them (12 Oct 2026).
 *
 * A GST-registered business's service or product with a null `gstRate` is
 * "not set": a line that bills it is taxed at nothing on a paper still
 * titled "Tax invoice" (D15, DEC-072). The team is asked where it takes the
 * money (`gst-rate-required.ts`), but a customer paying on the site never
 * is, so this read lets the business find those items first: priced, on
 * sale, and with no rate.
 *
 * Services, products, membership plans, class packs and courses carry a
 * rate. A plan is listed while it is on sale **or anyone is still on it**:
 * an archived plan's members keep renewing, and each renewal is a tax
 * invoice that needs the rate (a renewal is never stopped for it, so this
 * list is how the business hears).
 *
 * Each kind is read with its own permission, as the search is: a role that
 * can't read services is not shown them here.
 */

export interface MissingRateItem {
    kind: RatedKind;
    id: string;
    name: string;
    /** Its typed price in minor units. */
    priceCents: number;
    currency: string | null;
    /** Whether this person may save its rate. */
    canSet: boolean;
    /**
     * A plan's members now, active or paused, by the price each pays: their
     * next renewal carries the rate once it is chosen. The sheet says how
     * many, and what they pay now, before the rate is saved. Absent on
     * every other kind, and on a plan nobody is on.
     */
    members?: { count: number; price: string; currency: string }[];
    /**
     * How this item's price carries GST when it is not the business's way
     * (its own `gstPriceMode`). Absent: the business's.
     */
    priceMode?: GstPriceMode;
}

export interface MissingRates {
    /**
     * Whether the business issues tax invoices: registered, with its GSTIN
     * and state on file. False means nothing is asked of it.
     */
    registered: boolean;
    /** Empty for a business that isn't registered. */
    items: MissingRateItem[];
    /** True when more are missing than `items` lists. */
    more: boolean;
    /**
     * How a registered business's prices carry GST (`gst-price.ts`), so the
     * notice can say whether the rate chosen is inside the price or added
     * to it. Absent for a business that isn't registered: it is never told.
     */
    priceMode?: GstPriceMode;
}

/** As many as one sheet lists; more than this is said, not drawn. */
const LIST_CAP = 200;

/** Who may read each kind: the permission its own list asks for. */
const READ: Record<RatedKind, OrgAction> = {
    SERVICE: "service:read",
    PRODUCT: "store:read",
    PLAN: "subscription:read",
    PACK: "pack:read",
    COURSE: "course:read",
};

/** Who may change a rate on each kind: the kind's own editor's permission. */
const WRITE: Record<RatedKind, OrgAction> = {
    SERVICE: "service:write",
    PRODUCT: "store:write",
    PLAN: "subscription:write",
    PACK: "pack:write",
    COURSE: "course:write",
};

/** What a missing item is called in a 404. */
const NOUN: Record<RatedKind, string> = {
    SERVICE: "Service",
    PRODUCT: "Product",
    PLAN: "Plan",
    PACK: "Class pack",
    COURSE: "Course",
};

/**
 * Whether this person may choose a rate that is not set. The item's editor
 * may; so may whoever issues invoices (`invoice:write`), since the desk is
 * asked for the rate where it takes a payment and must be able to answer;
 * and so may whoever sells packs (`pack:sell`), for a pack, which is asked
 * for where it is sold. Those other ways fill in a rate nobody chose, and
 * never change one.
 */
function maySet(ctx: OrganizationContext, kind: RatedKind): boolean {
    return (
        allows(ctx, WRITE[kind]) ||
        allows(ctx, "invoice:write") ||
        (kind === "PACK" && allows(ctx, "pack:sell"))
    );
}

/** People on a plan now: active or paused. Their renewals carry its rate. */
const LIVE_MEMBERS = ["ACTIVE", "PAUSED"];

/** An item's own mode as the read serves it: only when it has one. */
function ownMode(stored: string | null): { priceMode?: GstPriceMode } {
    return isGstPriceMode(stored) ? { priceMode: stored } : {};
}

@Injectable()
export class GstRatesService {
    /**
     * The priced things on sale with no GST rate, services first, each by
     * name. Nothing for a business that isn't registered.
     */
    async missing(ctx: OrganizationContext): Promise<MissingRates> {
        const organizationId = ctx.organizationId;
        const profile = await loadTaxProfile(prisma, organizationId);
        const { registered } = profile;
        if (!registered) return { registered, items: [], more: false };

        const [services, products, plans, packs, courses] = await Promise.all([
            allows(ctx, READ.SERVICE)
                ? prisma.service.findMany({
                      where: {
                          organizationId,
                          deletedAt: null,
                          status: "ACTIVE",
                          priceCents: { gt: 0 },
                          gstRate: null,
                      },
                      orderBy: [{ name: "asc" }, { id: "asc" }],
                      take: LIST_CAP + 1,
                      select: {
                          id: true,
                          name: true,
                          priceCents: true,
                          currency: true,
                      },
                  })
                : [],
            allows(ctx, READ.PRODUCT)
                ? prisma.product.findMany({
                      where: {
                          organizationId,
                          status: "PUBLISHED",
                          price: { gt: 0 },
                          gstRate: null,
                      },
                      orderBy: [{ name: "asc" }, { id: "asc" }],
                      take: LIST_CAP + 1,
                      select: {
                          id: true,
                          name: true,
                          price: true,
                          currency: true,
                      },
                  })
                : [],
            // On sale, or archived with people still on it: they renew.
            allows(ctx, READ.PLAN)
                ? prisma.subscriptionPlan.findMany({
                      where: {
                          organizationId,
                          price: { gt: 0 },
                          gstRate: null,
                          OR: [
                              { status: "ACTIVE" },
                              {
                                  status: "ARCHIVED",
                                  subscriptions: {
                                      some: { status: { in: LIVE_MEMBERS } },
                                  },
                              },
                          ],
                      },
                      orderBy: [{ name: "asc" }, { id: "asc" }],
                      take: LIST_CAP + 1,
                      select: SOLD_SELECT,
                  })
                : [],
            allows(ctx, READ.PACK)
                ? prisma.classPack.findMany({
                      where: {
                          organizationId,
                          status: "ACTIVE",
                          price: { gt: 0 },
                          gstRate: null,
                      },
                      orderBy: [{ name: "asc" }, { id: "asc" }],
                      take: LIST_CAP + 1,
                      select: SOLD_SELECT,
                  })
                : [],
            // Taking enrolments: a draft, closed or archived course sells
            // nothing.
            allows(ctx, READ.COURSE)
                ? prisma.course.findMany({
                      where: {
                          organizationId,
                          status: "OPEN",
                          price: { gt: 0 },
                          gstRate: null,
                      },
                      orderBy: [{ name: "asc" }, { id: "asc" }],
                      take: LIST_CAP + 1,
                      select: SOLD_SELECT,
                  })
                : [],
        ]);
        const members = await planMembers(
            organizationId,
            plans.map((p) => p.id),
        );
        const sold = (
            kind: "PLAN" | "PACK" | "COURSE",
            rows: SoldRow[],
        ): MissingRateItem[] =>
            rows.map((r) => {
                const on = kind === "PLAN" ? members.get(r.id) : undefined;
                return {
                    kind,
                    id: r.id,
                    name: r.name,
                    priceCents: toCents(r.price.toString()),
                    currency: r.currency,
                    canSet: maySet(ctx, kind),
                    ...ownMode(r.gstPriceMode),
                    ...(on ? { members: on } : {}),
                };
            });
        const all: MissingRateItem[] = [
            ...services.map((s) => ({
                kind: "SERVICE" as const,
                id: s.id,
                name: s.name,
                priceCents: s.priceCents ?? 0,
                currency: s.currency,
                canSet: maySet(ctx, "SERVICE"),
            })),
            ...products.map((p) => ({
                kind: "PRODUCT" as const,
                id: p.id,
                name: p.name,
                priceCents: toCents(p.price.toString()),
                currency: p.currency,
                canSet: maySet(ctx, "PRODUCT"),
            })),
            ...sold("PLAN", plans),
            ...sold("PACK", packs),
            ...sold("COURSE", courses),
        ];
        return {
            registered,
            items: all.slice(0, LIST_CAP),
            more: all.length > LIST_CAP,
            priceMode: businessPriceMode(profile.priceMode),
        };
    }

    /**
     * Save a rate on each item named: all of them, or none. A rate is one
     * GST has, 0 included; clearing a rate is the item's own editor's job,
     * not this one's. An item in another business, or gone, is a 404.
     */
    async set(
        ctx: OrganizationContext,
        dto: SetGstRatesDto,
    ): Promise<{ saved: number }> {
        const kinds = new Set(dto.items.map((i) => i.kind));
        for (const kind of kinds) {
            if (!maySet(ctx, kind)) authorize(ctx, WRITE[kind]);
        }
        for (const item of dto.items) {
            if (!isGstRate(item.rate)) {
                throw new BadRequestException({
                    message: `${item.rate}% is not a GST rate. Use 0, 0.25, 3, 5, 12, 18, 28 or 40.`,
                    details: { field: "rate" },
                });
            }
        }
        await prisma.$transaction(async (tx) => {
            for (const item of dto.items) {
                // Without the editor's permission, only a rate nobody has
                // chosen yet is filled in: never one changed.
                const fill = !allows(ctx, WRITE[item.kind]);
                const outcome = await saveRate(tx, ctx, item, fill);
                if (outcome === "saved") continue;
                if (outcome === "missing") {
                    throw new NotFoundException(`${NOUN[item.kind]} not found`);
                }
                // It has a rate already, and changing one is its editor's.
                authorize(ctx, WRITE[item.kind]);
            }
        });
        return { saved: dto.items.length };
    }
}

type Tx = Prisma.TransactionClient;

/** What a plan, a pack or a course is listed from. */
const SOLD_SELECT = {
    id: true,
    name: true,
    price: true,
    currency: true,
    gstPriceMode: true,
} as const;

interface SoldRow {
    id: string;
    name: string;
    price: { toString(): string };
    currency: string;
    gstPriceMode: string | null;
}

/**
 * Save one item's rate. "missing": no such item in this business. "kept":
 * `fill` was asked and it already has a rate, so nothing was written.
 *
 * A plan and a pack are written under their row lock, with the event their
 * own editor's publish would record and the revision moved, so an editor
 * open on one reloads rather than save over the rate (#285). The rate is
 * written to the published columns: it is what the very next invoice
 * reads, a member's renewal included, and no paper already issued changes.
 */
async function saveRate(
    tx: Tx,
    ctx: OrganizationContext,
    item: { kind: RatedKind; id: string; rate: string },
    fill: boolean,
): Promise<"saved" | "kept" | "missing"> {
    const organizationId = ctx.organizationId;
    const unsetOnly = fill ? { gstRate: null } : {};
    const rate = bpsToRate(rateToBps(item.rate) ?? 0);
    const unsaved = (there: number) => (there === 0 ? "missing" : "kept");

    if (item.kind === "SERVICE") {
        const owned = { id: item.id, organizationId, deletedAt: null };
        const { count } = await tx.service.updateMany({
            where: { ...owned, ...unsetOnly },
            data: { gstRate: item.rate },
        });
        if (count > 0) return "saved";
        return unsaved(await tx.service.count({ where: owned }));
    }
    if (item.kind === "PRODUCT") {
        const owned = { id: item.id, organizationId };
        const { count } = await tx.product.updateMany({
            where: { ...owned, ...unsetOnly },
            data: { gstRate: item.rate },
        });
        if (count > 0) return "saved";
        return unsaved(await tx.product.count({ where: owned }));
    }
    if (item.kind === "COURSE") {
        const owned = { id: item.id, organizationId };
        const { count } = await tx.course.updateMany({
            where: { ...owned, ...unsetOnly },
            data: { gstRate: item.rate },
        });
        if (count > 0) return "saved";
        return unsaved(await tx.course.count({ where: owned }));
    }
    const actor = actorFromContext(ctx);
    if (item.kind === "PLAN") {
        await tx.$queryRaw`SELECT id FROM "SubscriptionPlan" WHERE id = ${item.id} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
        const plan = await tx.subscriptionPlan.findFirst({
            where: { id: item.id, organizationId },
            select: { gstRate: true },
        });
        if (!plan) return "missing";
        const was = storedRate(plan.gstRate);
        if (fill && was !== null) return "kept";
        if (was === rate) return "saved";
        await tx.subscriptionPlan.updateMany({
            where: { id: item.id, organizationId },
            data: { gstRate: item.rate, draftRevision: { increment: 1 } },
        });
        await tx.subscriptionPlanEvent.create({
            data: {
                organizationId,
                planId: item.id,
                kind: "PRICE_CHANGED",
                actorKind: actor.actorKind,
                actorUserId: actor.actorUserId,
                changes: { gstRate: [was, rate] },
            },
        });
        return "saved";
    }
    await tx.$queryRaw`SELECT id FROM "ClassPack" WHERE id = ${item.id} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
    const pack = await tx.classPack.findFirst({
        where: { id: item.id, organizationId },
        select: { gstRate: true },
    });
    if (!pack) return "missing";
    const was = storedRate(pack.gstRate);
    if (fill && was !== null) return "kept";
    if (was === rate) return "saved";
    await tx.classPack.updateMany({
        where: { id: item.id, organizationId },
        data: {
            gstRate: item.rate,
            draftRevision: { increment: 1 },
            revisedAt: new Date(),
            // A Saroh operator's save is never stored by id (DEC-035).
            revisedById:
                ctx.roleKey === PLATFORM_OPERATOR_ROLE_KEY ? null : ctx.userId,
        },
    });
    await tx.packEvent.create({
        data: {
            organizationId,
            packId: item.id,
            kind: "CHANGED",
            actorKind: actor.actorKind,
            actorUserId: actor.actorUserId,
            details: { gstRate: [was, rate] },
        },
    });
    return "saved";
}

/** A stored rate as it is written: "18", "0.25"; null when not set. */
function storedRate(rate: { toString(): string } | null): string | null {
    const bps = rateToBps(rate);
    return bps === null ? null : bpsToRate(bps);
}

/**
 * Each plan's members now, grouped by the price they pay (a subscription
 * keeps the price it was sold at), cheapest first.
 */
async function planMembers(
    organizationId: string,
    planIds: string[],
): Promise<Map<string, NonNullable<MissingRateItem["members"]>>> {
    const byPlan = new Map<string, NonNullable<MissingRateItem["members"]>>();
    if (planIds.length === 0) return byPlan;
    const groups = await prisma.customerSubscription.groupBy({
        by: ["planId", "price", "currency"],
        where: {
            organizationId,
            planId: { in: planIds },
            status: { in: LIVE_MEMBERS },
        },
        _count: { _all: true },
        orderBy: [{ planId: "asc" }, { price: "asc" }],
    });
    for (const g of groups) {
        const list = byPlan.get(g.planId) ?? [];
        list.push({
            count: g._count._all,
            price: fromCents(toCents(g.price.toString())),
            currency: g.currency,
        });
        byPlan.set(g.planId, list);
    }
    return byPlan;
}
