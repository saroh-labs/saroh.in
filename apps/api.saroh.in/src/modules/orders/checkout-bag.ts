import { prisma } from "@saroh/database";

import { fromMinor } from "../../common/money";
import type {
    AppliedDiscount,
    CodeCheck,
} from "../discounts/discounts.service";
import type { OrderView } from "../discounts/redeem";
import { customerRefusalMessage } from "../discounts/redeem";
import { businessTracksStock } from "../stock/tracking";
import type { PickupPlace } from "../stores/pickup-place";
import { pickupPlaceOf, waysWithPlace } from "../stores/pickup-place";
import type {
    BagLine,
    CheckoutQuote,
    DeliveryFees,
    QuoteDiscount,
    QuotedLine,
} from "./checkout-quote";
import { buildQuote, discountLines, quoteLines } from "./checkout-quote";
import { payableWays } from "./checkout-readiness";
import type { StorefrontFulfilmentType } from "./fulfilment";
import { NEW_STOREFRONT_TYPES, storefrontTypesOf } from "./fulfilment";

/**
 * The site's bag read from the server (round-2 G13): the sells-from
 * storefront's settings, and the bag priced from its listings and shelves.
 * `checkout-quote.ts` decides; this loads what it decides on. Every read
 * filters on the business and the storefront, and runs in the caller's
 * RLS context.
 */

/** Where the shop sells from, once every gate has passed. */
export interface ShopScope {
    organizationId: string;
    storefront: { id: string; name: string };
}

/** What the checkout reads from the storefront's settings. */
export interface ShopSettings {
    currency: string;
    /** Pick-up only when `pickup` is a place to collect from (UX-025). */
    ways: StorefrontFulfilmentType[];
    fees: DeliveryFees;
    /** Where a pick-up is collected: the address and hours; else null. */
    pickup: PickupPlace | null;
}

export async function shopSettings(scope: ShopScope): Promise<ShopSettings> {
    const row = await prisma.storeSettings.findUnique({
        where: { storeId: scope.storefront.id },
        select: {
            currency: true,
            fulfilmentTypes: true,
            collectionEnabled: true,
            shippingEnabled: true,
            localDeliveryFee: true,
            shippingFee: true,
            kind: true,
            address: true,
            openingHours: true,
        },
    });
    const pickup = pickupPlaceOf(row);
    return {
        currency: row?.currency ?? "INR",
        ways: waysWithPlace(
            row
                ? storefrontTypesOf(row.fulfilmentTypes, row)
                : NEW_STOREFRONT_TYPES,
            pickup,
        ),
        pickup,
        fees: {
            localDeliveryFee: row?.localDeliveryFee ?? null,
            shippingFee: row?.shippingFee ?? null,
        },
    };
}

/**
 * A code typed in the bag, and the one discount evaluation to judge it by
 * (`DiscountsService.checkForOrder`, bound to the site's business): the
 * counter's rules, never a copy of them (DEC-104).
 */
export interface BagCode {
    code: string;
    check: (order: OrderView) => Promise<CodeCheck>;
}

/**
 * The bag priced from the storefront's listings and shelves. With how the
 * storefront can be paid (`pays`), only the ways an order can be paid for
 * are offered: paying on handover alone can't pay for a shipment. With a
 * code, it is judged against the priced lines and what it takes off comes
 * off the total; `applied` is what an order placed now would record.
 */
export async function priceBag(
    scope: ShopScope,
    bag: BagLine[],
    asked: StorefrontFulfilmentType | null,
    pays?: { online: boolean; onHandover: boolean },
    code?: BagCode | null,
): Promise<{
    quote: CheckoutQuote;
    lines: QuotedLine[];
    settings: ShopSettings;
    applied: AppliedDiscount | null;
}> {
    const ids = [...new Set(bag.map((l) => l.listingId))];
    const [rows, settings, businessTracks] = await Promise.all([
        ids.length === 0
            ? Promise.resolve([])
            : prisma.productListing.findMany({
                  where: {
                      id: { in: ids },
                      organizationId: scope.organizationId,
                      storeId: scope.storefront.id,
                  },
                  select: {
                      id: true,
                      soldOutAt: true,
                      variants: { select: { variantId: true } },
                      product: {
                          select: {
                              id: true,
                              slug: true,
                              name: true,
                              status: true,
                              price: true,
                              categoryId: true,
                              stockTracked: true,
                              fulfilmentTypes: true,
                              images: {
                                  orderBy: { position: "asc" },
                                  take: 1,
                                  select: {
                                      url: true,
                                      alt: true,
                                      kind: true,
                                      posterUrl: true,
                                  },
                              },
                              variants: {
                                  orderBy: [{ position: "asc" }, { id: "asc" }],
                                  select: {
                                      id: true,
                                      title: true,
                                      price: true,
                                  },
                              },
                          },
                      },
                  },
              }),
        shopSettings(scope),
        businessTracksStock(prisma, scope.organizationId),
    ]);
    const productIds = rows.map((r) => r.product.id);
    const shelves =
        productIds.length === 0
            ? []
            : await prisma.stockLevel.findMany({
                  where: {
                      organizationId: scope.organizationId,
                      storeId: scope.storefront.id,
                      productId: { in: productIds },
                  },
                  select: {
                      productId: true,
                      variantId: true,
                      onHand: true,
                      promised: true,
                  },
              });
    const lines = quoteLines(
        bag,
        rows.map((r) => {
            const cover =
                r.product.images.length > 0 ? r.product.images[0] : null;
            return {
                id: r.id,
                soldOutAt: r.soldOutAt,
                variantIds: r.variants.map((v) => v.variantId),
                product: {
                    ...r.product,
                    cover: !cover
                        ? null
                        : cover.kind === "video"
                          ? cover.posterUrl
                              ? { url: cover.posterUrl, alt: cover.alt }
                              : null
                          : { url: cover.url, alt: cover.alt },
                },
            };
        }),
        shelves,
        businessTracks,
    );
    const discount = code
        ? judgeCode(
              await code.check({
                  storeId: scope.storefront.id,
                  currency: settings.currency,
                  lines: discountLines(lines),
              }),
          )
        : null;
    const quote = buildQuote({
        currency: settings.currency,
        lines,
        storefrontWays: pays ? payableWays(pays, settings.ways) : settings.ways,
        fees: settings.fees,
        asked,
        discount,
    });
    return {
        quote,
        lines,
        settings,
        applied: discount?.applied ?? null,
    };
}

/** The evaluation's answer, as the bag shows it and an order records it. */
function judgeCode(check: CodeCheck): {
    view: QuoteDiscount;
    cents: number;
    applied: AppliedDiscount | null;
} {
    if (!check.ok) {
        return {
            view: {
                code: check.code,
                applied: false,
                reason: check.reason,
                message: customerRefusalMessage(check.code, check.reason),
            },
            cents: 0,
            applied: null,
        };
    }
    return {
        view: {
            code: check.applied.code,
            applied: true,
            amount: fromMinor(check.applied.amountCents),
        },
        cents: check.applied.amountCents,
        applied: check.applied,
    };
}
