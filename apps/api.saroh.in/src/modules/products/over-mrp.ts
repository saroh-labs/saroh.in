import type { Prisma } from "@saroh/database";

import type { GstPriceMode, PriceTerms } from "../invoices/gst-price";
import { productOverMrp } from "./product-rules";

/**
 * The products, and their options, that GST added takes over their MRP
 * (the owner, 12 Oct 2026: "GST is part of MRP").
 *
 * A product's own writes are refused before they get there
 * (`product-rules.ts`), so this list is what a change to the whole business
 * would do: switching its prices to "GST is added" (or registering for GST
 * with products already set that way) adds GST to many prices at once. The
 * tax settings count these before they save, and the sheet names the first
 * few. It also finds what is over as things stand, for a business that
 * switched before the rule existed.
 *
 * Only what GST added causes is listed: a typed price above its MRP with no
 * GST on top is its own form's refusal, never this one's.
 */

export interface OverMrpItem {
    productId: string;
    /** The product's name. */
    name: string;
    /** The option it is about ("Large"); null for the product's own price. */
    option: string | null;
    currency: string;
    /** The typed price, the amount to pay for one, and the MRP, × 100. */
    listCents: number;
    payCents: number;
    mrpCents: number;
    /** The rate GST is added at: "18". */
    rate: string | null;
}

export interface OverMrpList {
    /** Products with their own price, or any option, over the MRP. */
    products: number;
    /** Options over their MRP, across those products. */
    options: number;
    /** The first few, by product name. */
    items: OverMrpItem[];
    /** True when more are over than `items` lists. */
    more: boolean;
}

/** What the read answers with: the list, and the terms it was judged under. */
export interface OverMrpRead extends OverMrpList {
    /** False: the business charges no GST, so nothing can be over. */
    registered: boolean;
    /** The business's way the list was judged under. */
    mode: GstPriceMode;
}

/** As many as a sheet names; the counts say the rest. */
export const OVER_MRP_LIST_CAP = 20;

const NONE: OverMrpList = { products: 0, options: 0, items: [], more: false };

type Db = Pick<Prisma.TransactionClient, "product">;

/**
 * Everything not archived that would be over its MRP under `terms`. A draft
 * counts: it is published without being priced again. An archived product
 * is judged when it is brought back (`ProductsService`).
 */
export async function findOverMrp(
    db: Db,
    organizationId: string,
    terms: PriceTerms,
): Promise<OverMrpList> {
    if (!terms.registered) return NONE;
    const rows = await db.product.findMany({
        where: {
            organizationId,
            status: { not: "ARCHIVED" },
            gstRate: { gt: 0 },
            AND: [
                // Priced with GST added: its own way, or the business's.
                terms.mode === "ADDED"
                    ? {
                          OR: [
                              { gstPriceMode: null },
                              { gstPriceMode: "ADDED" },
                          ],
                      }
                    : { gstPriceMode: "ADDED" },
                // With an MRP to be over.
                {
                    OR: [
                        { mrp: { not: null } },
                        { variants: { some: { mrp: { not: null } } } },
                    ],
                },
            ],
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
            id: true,
            name: true,
            price: true,
            mrp: true,
            currency: true,
            gstRate: true,
            gstPriceMode: true,
            variants: {
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                select: { title: true, price: true, mrp: true },
            },
        },
    });

    let products = 0;
    let options = 0;
    const items: OverMrpItem[] = [];
    for (const p of rows) {
        const found = productOverMrp(
            {
                price: p.price.toString(),
                mrp: p.mrp?.toString() ?? null,
                gstRate: p.gstRate,
                gstPriceMode: p.gstPriceMode,
                variants: p.variants.map((v) => ({
                    title: v.title,
                    price: v.price?.toString() ?? null,
                    mrp: v.mrp?.toString() ?? null,
                })),
            },
            terms,
            true,
        );
        if (found.length === 0) continue;
        products += 1;
        for (const over of found) {
            if (over.option !== null) options += 1;
            items.push({
                productId: p.id,
                name: p.name,
                option: over.option,
                currency: p.currency,
                listCents: over.listCents,
                payCents: over.payCents,
                mrpCents: over.mrpCents,
                rate: over.addedRate,
            });
        }
    }
    return {
        products,
        options,
        items: items.slice(0, OVER_MRP_LIST_CAP),
        more: items.length > OVER_MRP_LIST_CAP,
    };
}

/** "Face cream", or "Face cream (Large)" for one of its options. */
export function overMrpName(
    item: Pick<OverMrpItem, "name" | "option">,
): string {
    return item.option ? `${item.name} (${item.option})` : item.name;
}

/** How many names a refusal's own sentence carries. */
const NAMED = 3;

/**
 * Why the business's switch is refused, with the count and the first few
 * names, and the way out. Null when nothing would be over.
 */
export function overMrpRefusal(list: OverMrpList): string | null {
    const total = list.items.length;
    if (list.products === 0 || total === 0) return null;
    const named = list.items.slice(0, NAMED).map(overMrpName);
    // A product and its options are counted once each in the list.
    const lines = list.more ? null : total;
    const rest = lines === null ? null : lines - named.length;
    const names =
        rest === null
            ? `${named.join(", ")} and more`
            : rest > 0
              ? `${named.join(", ")} and ${rest} more`
              : named.length > 1
                ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1] ?? ""}`
                : (named[0] ?? "");
    const one = list.products === 1;
    const what = one ? "1 product" : `${list.products} products`;
    return `With GST added, ${what} would cost more than ${one ? "its" : "their"} MRP: ${names}. Lower the price or raise the MRP on ${one ? "it" : "each"}, or set ${one ? "it" : "each one"} to "Includes GST", then save this again.`;
}
