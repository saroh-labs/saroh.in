import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { MODULE_BY_KEY } from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import {
    commerceOpen,
    effectiveStorefront,
    shopRolloutOn,
} from "../sites/sells-from";
import { businessTracksStock } from "../stock/tracking";
import { collectionOnSale } from "./grid-collection";
import type { GridQuery } from "./product-grid";
import { inGridOrder } from "./product-grid";
import { ratingSummary } from "./product-overview";
import type {
    PublicCatalogue,
    PublicCatalogueCard,
    PublicImage,
    PublicProduct,
    ShelfRow,
} from "./public-catalogue.serialize";
import {
    allergenText,
    blurbOf,
    fieldText,
    money,
    onTheShop,
    priceOf,
    publicStock,
    reviewDay,
    shelfFor,
} from "./public-catalogue.serialize";

/**
 * The public catalogue (round-2 G11): what a merchant's site lists at
 * `/shop`, and one product's page at `/shop/<slug>`.
 *
 * - **Derived, never accepted.** The Site is resolved first and its
 *   organization taken from it; the caller names only the site and a slug.
 *   Every later read runs in that organization's RLS context
 *   (`runInOrgContext`) and filters on it too, so another business's
 *   product is a 404 twice over.
 * - **Only what is sold here.** Products that are published (not draft, not
 *   archived) and listed at the site's sells-from storefront, with only the
 *   variants listed there (ADR-010). No storefront chosen, a closed one, the
 *   shop not open for the business (`SITE_SHOP`, off until checkout ships)
 *   or Commerce switched off: 404, like a site with no shop.
 * - **An explicit allow-list** (`public-catalogue.serialize.ts`).
 * - **Limited per visitor.** Keyed on the visitor's address: the signed
 *   relay's when saroh.app relays the call, otherwise the caller's own.
 * - **The Product grid (G12)** asks the same list for the newest, one
 *   collection's or hand-picked products, and a count. Same gates, same
 *   allow-list, same per-visitor limit; it also needs Commerce rolled out
 *   for the business (DEC-057). An empty grid is an empty list, not a 404:
 *   the shop is open, there is just nothing to show in that block.
 */

/** Page views per visitor per minute: a busy browse is fine, a scraper not. */
const READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** The most `/shop` lists; a small business's shop is well under it. */
const MAX_PRODUCTS = 200;

/** Latest published reviews on a product page. */
const REVIEWS_SHOWN = 4;

/** Every miss looks the same: no shop, another business's product alike. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

const IMAGE_SELECT = {
    id: true,
    url: true,
    alt: true,
    width: true,
    height: true,
    kind: true,
    durationSec: true,
    posterUrl: true,
} satisfies Prisma.ProductImageSelect;

const VARIANT_SELECT = {
    id: true,
    title: true,
    price: true,
    mrp: true,
    imageId: true,
    position: true,
} satisfies Prisma.ProductVariantSelect;

type ImageRow = Prisma.ProductImageGetPayload<{ select: typeof IMAGE_SELECT }>;

function image(row: ImageRow): PublicImage {
    return {
        id: row.id,
        url: row.url,
        alt: row.alt,
        width: row.width,
        height: row.height,
        kind: row.kind === "video" ? "video" : "photo",
        durationSec: row.durationSec,
        posterUrl: row.posterUrl,
    };
}

/** Where the shop reads from, once every gate has passed. */
interface ShopScope {
    organizationId: string;
    storefront: { id: string; name: string };
}

/** What a card needs of a listing and its product. */
const CARD_SELECT = {
    soldOutAt: true,
    variants: { select: { variantId: true } },
    product: {
        select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            price: true,
            mrp: true,
            currency: true,
            stockTracked: true,
            images: {
                orderBy: { position: "asc" },
                take: 1,
                select: IMAGE_SELECT,
            },
            variants: {
                orderBy: [{ position: "asc" }, { id: "asc" }],
                select: VARIANT_SELECT,
            },
        },
    },
} satisfies Prisma.ProductListingSelect;

type CardListing = Prisma.ProductListingGetPayload<{
    select: typeof CARD_SELECT;
}>;

/** A listing with the variants it offers here. */
interface OfferedListing {
    listing: CardListing;
    offered: CardListing["product"]["variants"];
    /** For `inGridOrder`. */
    product: { id: string };
}

/**
 * The listings with something to offer here: a product with variants, none
 * of them sold at this storefront, has nothing to sell and is left out.
 */
function offeredOnly(listings: readonly CardListing[]): OfferedListing[] {
    const out: OfferedListing[] = [];
    for (const listing of listings) {
        const listed = new Set(listing.variants.map((v) => v.variantId));
        const p = listing.product;
        const offered = p.variants.filter((v) => listed.has(v.id));
        if (p.variants.length > 0 && offered.length === 0) continue;
        out.push({ listing, offered, product: { id: p.id } });
    }
    return out;
}

// Stateless (it reads the flag rows on every call).
const flags = new FeatureFlagService();

/**
 * Whether Commerce is rolled out for the business (DEC-057): a module whose
 * rollout flag is off is shown nowhere, so its products are in no block.
 */
async function commerceRolledOut(organizationId: string): Promise<boolean> {
    const descriptor = MODULE_BY_KEY.get("COMMERCE");
    return descriptor
        ? flags.isEnabled(descriptor.rolloutFlag, organizationId)
        : false;
}

@Injectable()
export class PublicCatalogueService {
    constructor(
        // Not a DI provider — a per-instance default that tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    /**
     * Everything sold at the site's storefront, by name — or, for a Product
     * grid (G12), the products `grid` asks for, at most its count.
     */
    async list(
        siteId: string,
        callerHash: string | undefined,
        grid: GridQuery | null = null,
    ): Promise<PublicCatalogue> {
        return this.inShop(siteId, callerHash, async (scope) => {
            if (grid) {
                if (!(await commerceRolledOut(scope.organizationId))) {
                    notFound();
                }
                return {
                    storefront: { name: scope.storefront.name },
                    products: await this.grid(scope, grid),
                };
            }
            const listings = offeredOnly(
                await prisma.productListing.findMany({
                    where: {
                        organizationId: scope.organizationId,
                        storeId: scope.storefront.id,
                        product: { status: "PUBLISHED" },
                    },
                    orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
                    take: MAX_PRODUCTS,
                    select: CARD_SELECT,
                }),
            );
            const products = await this.cards(scope, listings);
            if (products.length === 0) notFound();
            return { storefront: { name: scope.storefront.name }, products };
        });
    }

    /**
     * The Product grid's products (G12), in its order: published, listed
     * here, with a variant sold here. A product that isn't (archived, a
     * draft, unlisted, another business's) drops out and the next moves up.
     */
    private async grid(
        scope: ShopScope,
        grid: GridQuery,
    ): Promise<PublicCatalogueCard[]> {
        const sold = {
            organizationId: scope.organizationId,
            storeId: scope.storefront.id,
            product: { status: "PUBLISHED" },
        } satisfies Prisma.ProductListingWhereInput;

        if (grid.source === "newest") {
            const listings = offeredOnly(
                await prisma.productListing.findMany({
                    where: sold,
                    orderBy: [
                        { product: { createdAt: "desc" } },
                        { product: { id: "asc" } },
                    ],
                    take: MAX_PRODUCTS,
                    select: CARD_SELECT,
                }),
            );
            return this.cards(scope, listings.slice(0, grid.count));
        }

        // A collection: its products sold here, in its order. Another
        // business's collection, or one since deleted, holds none.
        const order =
            grid.source === "picked"
                ? grid.productIds
                : grid.collectionId
                  ? ((
                        await collectionOnSale(
                            scope.organizationId,
                            grid.collectionId,
                            scope.storefront.id,
                        )
                    )?.productIds ?? [])
                  : [];
        if (order.length === 0) return [];
        const listings = offeredOnly(
            await prisma.productListing.findMany({
                where: { ...sold, productId: { in: [...order] } },
                select: CARD_SELECT,
            }),
        );
        return this.cards(scope, inGridOrder(order, listings, grid.count));
    }

    /** Cards for listings already narrowed to what is offered here. */
    private async cards(
        scope: ShopScope,
        listings: readonly OfferedListing[],
    ): Promise<PublicCatalogueCard[]> {
        if (listings.length === 0) return [];
        const [rows, businessTracks] = await Promise.all([
            this.shelves(
                scope,
                listings.map((l) => l.product.id),
            ),
            businessTracksStock(prisma, scope.organizationId),
        ]);
        return listings.map(({ listing, offered }) => {
            const p = listing.product;
            const tracked = p.stockTracked && businessTracks;
            const markedSoldOut = listing.soldOutAt !== null;
            const words =
                offered.length > 0
                    ? offered.map(
                          (v) =>
                              publicStock({
                                  tracked,
                                  markedSoldOut,
                                  row: shelfFor(rows, p.id, v.id),
                              }).word,
                      )
                    : [
                          publicStock({
                              tracked,
                              markedSoldOut,
                              row: shelfFor(rows, p.id, null),
                          }).word,
                      ];
            const base = {
                price: money(p.price) ?? "0.00",
                mrp: money(p.mrp),
            };
            const cover = p.images.length > 0 ? p.images[0] : null;
            return {
                slug: p.slug,
                name: p.name,
                currency: p.currency,
                ...priceOf(
                    base,
                    offered.map((v) => ({
                        price: money(v.price),
                        mrp: money(v.mrp),
                    })),
                ),
                image: cover
                    ? cover.kind === "video"
                        ? cover.posterUrl
                            ? { url: cover.posterUrl, alt: cover.alt }
                            : null
                        : { url: cover.url, alt: cover.alt }
                    : null,
                variantTitles: offered.map((v) => v.title),
                blurb: blurbOf(p.description),
                soldOut: words.every((w) => w === "SOLD_OUT"),
            };
        });
    }

    /** One product sold at the site's storefront, by its address. */
    async product(
        siteId: string,
        slug: string,
        callerHash: string | undefined,
    ): Promise<PublicProduct> {
        return this.inShop(siteId, callerHash, async (scope) => {
            const p = await prisma.product.findFirst({
                where: {
                    organizationId: scope.organizationId,
                    slug,
                    status: "PUBLISHED",
                    listings: { some: { storeId: scope.storefront.id } },
                },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    description: true,
                    price: true,
                    mrp: true,
                    currency: true,
                    stockTracked: true,
                    shopFields: true,
                    howToUse: true,
                    materials: true,
                    keyPoints: true,
                    madeHere: true,
                    maker: true,
                    madeIn: true,
                    warranty: true,
                    returnsMode: true,
                    returnsText: true,
                    seoTitle: true,
                    seoDescription: true,
                    category: { select: { name: true } },
                    option: { select: { name: true } },
                    images: {
                        orderBy: { position: "asc" },
                        select: IMAGE_SELECT,
                    },
                    variants: {
                        orderBy: [{ position: "asc" }, { id: "asc" }],
                        select: VARIANT_SELECT,
                    },
                    listings: {
                        where: { storeId: scope.storefront.id },
                        select: {
                            id: true,
                            soldOutAt: true,
                            variants: { select: { variantId: true } },
                        },
                    },
                    allergens: {
                        select: {
                            kind: true,
                            allergen: { select: { name: true } },
                        },
                    },
                    fieldValues: {
                        where: { field: { onShop: true, deletedAt: null } },
                        orderBy: { field: { position: "asc" } },
                        select: {
                            value: true,
                            field: { select: { name: true, type: true } },
                        },
                    },
                },
            });
            const listing = p?.listings[0];
            if (!p || !listing) notFound();
            const listed = new Set(listing.variants.map((v) => v.variantId));
            const offered = p.variants.filter((v) => listed.has(v.id));
            if (p.variants.length > 0 && offered.length === 0) notFound();

            const [rows, businessTracks, reviews] = await Promise.all([
                this.shelves(scope, [p.id]),
                businessTracksStock(prisma, scope.organizationId),
                this.reviews(scope, p.id, p.variants),
            ]);
            const tracked = p.stockTracked && businessTracks;
            const markedSoldOut = listing.soldOutAt !== null;
            const shown = (key: string) => onTheShop(p.shopFields, key);
            const allergens = allergenText(
                p.allergens.map((a) => ({
                    kind: a.kind,
                    name: a.allergen.name,
                })),
            );
            const maker = p.madeHere
                ? shown("maker")
                    ? scope.storefront.name
                    : null
                : [
                      shown("maker") ? p.maker : null,
                      shown("madeIn") ? p.madeIn : null,
                  ]
                      .filter(Boolean)
                      .join(", ") || null;

            return {
                slug: p.slug,
                // What the bag holds (G13): the listing, never a price.
                listingId: listing.id,
                name: p.name,
                currency: p.currency,
                price: money(p.price) ?? "0.00",
                mrp: money(p.mrp),
                categoryName: p.category?.name ?? null,
                description: p.description,
                keyPoints: shown("keyPoints") ? p.keyPoints : [],
                howToUse: shown("howToUse") ? p.howToUse : null,
                materials: shown("materials") ? p.materials : null,
                materialsLabel: "Ingredients or material",
                maker,
                warranty: shown("warranty") ? p.warranty : null,
                // The storefront's own rule has no words to show yet; only a
                // product's own returns text is printed.
                returns:
                    shown("returns") && p.returnsMode === "OWN"
                        ? p.returnsText
                        : null,
                extras: [
                    // Always shown when ticked: the shop never claims a
                    // product is free of an allergen it does not list.
                    ...(allergens
                        ? [{ label: "Allergens", value: allergens }]
                        : []),
                    ...p.fieldValues
                        .filter((f) => f.value.trim() !== "")
                        .map((f) => ({
                            label: f.field.name,
                            value: fieldText(f.field.type, f.value),
                        })),
                ],
                images: p.images.map(image),
                optionName: p.option?.name ?? null,
                variants: offered.map((v) => {
                    const stock = publicStock({
                        tracked,
                        markedSoldOut,
                        row: shelfFor(rows, p.id, v.id),
                    });
                    return {
                        id: v.id,
                        title: v.title,
                        price: money(v.price),
                        mrp: money(v.mrp),
                        imageId: v.imageId,
                        stock: stock.word,
                        left: stock.left,
                    };
                }),
                stock:
                    offered.length > 0
                        ? null
                        : publicStock({
                              tracked,
                              markedSoldOut,
                              row: shelfFor(rows, p.id, null),
                          }),
                ...reviews,
                seoTitle: p.seoTitle,
                seoDescription: p.seoDescription,
            };
        });
    }

    /**
     * The limit, the site, its business, and every gate — then `fn` in the
     * business's RLS context with the storefront it sells from.
     */
    private async inShop<T>(
        siteId: string,
        callerHash: string | undefined,
        fn: (scope: ShopScope) => Promise<T>,
    ): Promise<T> {
        // A caller the platform gives no address for shares one bucket per
        // site, as the other public reads do.
        if (!this.limiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true, storefrontId: true },
        });
        if (!site) notFound();
        const { organizationId } = site;
        if (!(await shopRolloutOn(organizationId))) notFound();

        return runInOrgContext(organizationId, async () => {
            if (!(await commerceOpen(prisma, organizationId))) notFound();
            const storefront = await effectiveStorefront(prisma, site);
            if (!storefront) notFound();
            return fn({ organizationId, storefront });
        });
    }

    /** The storefront's shelves of these products. */
    private async shelves(
        scope: ShopScope,
        productIds: readonly string[],
    ): Promise<ShelfRow[]> {
        if (productIds.length === 0) return [];
        return prisma.stockLevel.findMany({
            where: {
                organizationId: scope.organizationId,
                storeId: scope.storefront.id,
                productId: { in: [...productIds] },
            },
            select: {
                productId: true,
                variantId: true,
                onHand: true,
                promised: true,
                lowStockAlert: true,
            },
        });
    }

    /** The rating and the latest published reviews — never a hidden one. */
    private async reviews(
        scope: ShopScope,
        productId: string,
        variants: readonly { id: string; title: string }[],
    ): Promise<Pick<PublicProduct, "rating" | "reviews">> {
        const published = {
            organizationId: scope.organizationId,
            productId,
            status: "PUBLISHED",
        };
        const [ratings, latest] = await Promise.all([
            prisma.productReview.findMany({
                where: published,
                select: { rating: true },
            }),
            prisma.productReview.findMany({
                where: published,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: REVIEWS_SHOWN,
                select: {
                    id: true,
                    rating: true,
                    body: true,
                    displayName: true,
                    reply: true,
                    createdAt: true,
                    orderItem: { select: { variantId: true } },
                },
            }),
        ]);
        const summary = ratingSummary(ratings.map((r) => r.rating));
        const titles = new Map(variants.map((v) => [v.id, v.title]));
        return {
            rating:
                summary.average !== null && summary.count > 0
                    ? { average: summary.average, count: summary.count }
                    : null,
            reviews: latest.map((r) => {
                const variantId = r.orderItem?.variantId ?? null;
                return {
                    id: r.id,
                    rating: r.rating,
                    body: r.body,
                    displayName: r.displayName,
                    variantTitle: variantId
                        ? (titles.get(variantId) ?? null)
                        : null,
                    reply: r.reply,
                    dateLabel: reviewDay(r.createdAt),
                };
            }),
        };
    }
}
