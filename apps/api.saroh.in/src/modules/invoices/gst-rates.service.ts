import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { allows, authorize } from "../organizations/organization-policy";
import { isGstRate } from "./gst";
import type { GstPriceMode } from "./gst-price";
import { businessPriceMode } from "./gst-price";
import type { RatedKind, SetGstRatesDto } from "./gst-rates.dto";
import { loadTaxProfile } from "./order-invoicing";
import { toCents } from "./totals";

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
 * Services and products are the only things sold that carry a rate. A
 * course, a class pack and a subscription plan have no rate column, so
 * they are not listed here: there is nowhere to save one yet.
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

/** Who may change a rate on each kind: the kind's own editor's permission. */
const WRITE = { SERVICE: "service:write", PRODUCT: "store:write" } as const;

/**
 * Whether this person may choose a rate that is not set. The item's editor
 * may; so may whoever issues invoices (`invoice:write`), since the desk is
 * asked for the rate where it takes a payment and must be able to answer.
 * That second way fills in a rate nobody chose, and never changes one.
 */
function maySet(ctx: OrganizationContext, kind: RatedKind): boolean {
    return allows(ctx, WRITE[kind]) || allows(ctx, "invoice:write");
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

        const [services, products] = await Promise.all([
            allows(ctx, "service:read")
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
            allows(ctx, "store:read")
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
        ]);
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
        const organizationId = ctx.organizationId;
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
                const unsetOnly = allows(ctx, WRITE[item.kind])
                    ? {}
                    : { gstRate: null };
                const owned =
                    item.kind === "SERVICE"
                        ? { id: item.id, organizationId, deletedAt: null }
                        : { id: item.id, organizationId };
                const { count } =
                    item.kind === "SERVICE"
                        ? await tx.service.updateMany({
                              where: { ...owned, ...unsetOnly },
                              data: { gstRate: item.rate },
                          })
                        : await tx.product.updateMany({
                              where: { ...owned, ...unsetOnly },
                              data: { gstRate: item.rate },
                          });
                if (count > 0) continue;
                const there =
                    item.kind === "SERVICE"
                        ? await tx.service.count({ where: owned })
                        : await tx.product.count({ where: owned });
                if (there === 0) {
                    throw new NotFoundException(
                        item.kind === "SERVICE"
                            ? "Service not found"
                            : "Product not found",
                    );
                }
                // It has a rate already, and changing one is its editor's.
                authorize(ctx, WRITE[item.kind]);
            }
        });
        return { saved: dto.items.length };
    }
}
