import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { ProductPlacement } from "../collections/collections.service";
import { productPlacement } from "../collections/collections.service";
import { discountState } from "../discounts/discount-state";
import type { OrgAction } from "../organizations/organization-policy";
import type { ProductScope } from "./product-access";
import type { RatingSummary, StockLine, StockTotals } from "./product-overview";
import { ratingSummary, stockLine, stockTotals } from "./product-overview";
import { savingPercent } from "./product-rules";
import { ProductsService } from "./products.service";
import type { ProductDetailDto } from "./serialize";

/**
 * A panel of the product page. Each is gathered on its own so one failure
 * blanks one panel, never the page — the design's "Orders failed" state — and
 * a panel the caller may not see says so instead of leaking or failing.
 */
export type Panel<T> =
    { status: "ok"; data: T } | { status: "failed" } | { status: "forbidden" };

export interface OverviewOrder {
    id: string;
    orderNumber: string;
    customerId: string;
    customer: string;
    status: string;
    open: boolean;
    createdAt: Date;
    lines: { variantId: string | null; title: string; quantity: number }[];
}

export interface OverviewOrders {
    openCount: number;
    thisMonthCount: number;
    /** Units sold this month per variant id ("" for lines with no variant). */
    soldThisMonth: Record<string, number>;
    recent: OverviewOrder[];
}

export interface OverviewReview {
    id: string;
    rating: number;
    body: string | null;
    displayName: string;
    /** Null when the customer record has gone. */
    customerId: string | null;
    status: "PUBLISHED" | "HIDDEN";
    reply: string | null;
    variantId: string | null;
    variantTitle: string | null;
    createdAt: Date;
}

export interface OverviewReviews {
    summary: RatingSummary;
    toAnswer: number;
    hiddenCount: number;
    latest: OverviewReview[];
}

export interface OverviewDiscount {
    id: string;
    code: string;
    description: string | null;
    kind: string;
    percentBps: number | null;
    amount: string | null;
    appliesTo: string;
    state: string;
    startsAt: Date | null;
    endsAt: Date | null;
    usedOnProduct: number;
}

export interface ProductOverview {
    product: ProductDetailDto;
    stock: {
        mode: "product" | "variant";
        variants: (StockLine & { variantId: string })[];
        product: StockLine | null;
        totals: StockTotals;
    };
    price: {
        min: string;
        max: string;
        mrp: string | null;
        savingPercent: number | null;
    };
    lastChanged: Date;
    storefront: { id: string; name: string };
    canWrite: boolean;
    orders: Panel<OverviewOrders>;
    reviews: Panel<OverviewReviews>;
    discounts: Panel<OverviewDiscount[]>;
    /**
     * The collections it is in and the live website pages that show it
     * (#516). `website.showsProducts` is false until the website has a
     * block that can show products (#473): "The website doesn't show
     * products yet."
     */
    placement: Panel<ProductPlacement>;
}

const OPEN_STATUSES = ["PENDING", "PROCESSING"];
const RECENT_ORDERS = 20;
const LATEST_REVIEWS = 20;

/**
 * Everything the product page shows, in one read: the product, its stock by
 * variant, and summaries of its orders, reviews and discounts. Scoped by the
 * store read check; orders and reviews each need their own permission too.
 */
@Injectable()
export class ProductOverviewService {
    private readonly logger = new Logger(ProductOverviewService.name);

    constructor(private readonly products: ProductsService) {}

    /** Store-route alias of `getIn`. */
    async get(
        storeId: string,
        productId: string,
        userId: string,
        now: Date = new Date(),
    ): Promise<ProductOverview> {
        return this.getIn(
            await this.products.access.readViaStore(storeId, userId, productId),
            productId,
            now,
        );
    }

    async getIn(
        scope: ProductScope,
        productId: string,
        now: Date = new Date(),
    ): Promise<ProductOverview> {
        const { storeId, organizationId } = scope;
        const product = await this.products.getIn(scope, productId);
        const store = await prisma.store.findUniqueOrThrow({
            where: { id: storeId },
            select: { id: true, name: true },
        });

        const variantLines = product.variants.flatMap((v) =>
            v.inventory ? [{ ...stockLine(v.inventory), variantId: v.id }] : [],
        );
        const mode = product.stockMode;
        const productLine =
            mode === "product" && product.inventory
                ? stockLine(product.inventory)
                : null;
        const totals =
            mode === "variant"
                ? stockTotals(variantLines, product.inventory)
                : stockTotals(productLine ? [productLine] : [], null);

        const [orders, reviews, discounts, placement] = await Promise.all([
            this.panel(scope, "order:read", "orders", () =>
                this.orders(productId, now),
            ),
            this.panel(scope, "product-review:read", "reviews", () =>
                this.reviews(productId, product),
            ),
            this.panel(scope, "discount:read", "discounts", () =>
                this.discounts(organizationId, storeId, product, now),
            ),
            this.panel(scope, "store:read", "collections", () =>
                productPlacement(organizationId, productId),
            ),
        ]);

        return {
            product,
            stock: {
                mode,
                variants: variantLines,
                product: productLine,
                totals,
            },
            price: priceRange(product),
            lastChanged: lastChanged(product),
            storefront: { id: store.id, name: store.name },
            canWrite: scope.canWrite,
            orders,
            reviews,
            discounts,
            placement,
        };
    }

    private async panel<T>(
        scope: ProductScope,
        action: OrgAction,
        name: string,
        load: () => Promise<T>,
    ): Promise<Panel<T>> {
        try {
            if (!(await scope.may(action))) {
                return { status: "forbidden" };
            }
            return { status: "ok", data: await load() };
        } catch (error) {
            this.logger.warn(
                `product overview: the ${name} panel failed: ${String(error)}`,
            );
            return { status: "failed" };
        }
    }

    private async orders(
        productId: string,
        now: Date,
    ): Promise<OverviewOrders> {
        const monthStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        );
        const withProduct = { items: { some: { productId } } };
        const [openCount, thisMonthCount, soldRows, recent] = await Promise.all(
            [
                prisma.order.count({
                    where: { ...withProduct, status: { in: OPEN_STATUSES } },
                }),
                prisma.order.count({
                    where: { ...withProduct, createdAt: { gte: monthStart } },
                }),
                prisma.orderItem.groupBy({
                    by: ["variantId"],
                    where: {
                        productId,
                        order: {
                            createdAt: { gte: monthStart },
                            status: { not: "CANCELLED" },
                        },
                    },
                    _sum: { quantity: true },
                }),
                prisma.order.findMany({
                    where: withProduct,
                    orderBy: { createdAt: "desc" },
                    take: RECENT_ORDERS,
                    select: {
                        id: true,
                        orderId: true,
                        status: true,
                        createdAt: true,
                        customerId: true,
                        customer: {
                            select: {
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                        items: {
                            where: { productId },
                            select: {
                                quantity: true,
                                variantId: true,
                                variant: { select: { title: true } },
                            },
                        },
                    },
                }),
            ],
        );

        const soldThisMonth: Record<string, number> = {};
        for (const row of soldRows) {
            soldThisMonth[row.variantId ?? ""] = row._sum.quantity ?? 0;
        }
        return {
            openCount,
            thisMonthCount,
            soldThisMonth,
            recent: recent.map((o) => ({
                id: o.id,
                orderNumber: o.orderId,
                customerId: o.customerId,
                customer:
                    [o.customer.firstName, o.customer.lastName]
                        .filter(Boolean)
                        .join(" ") || o.customer.email,
                status: o.status,
                open: OPEN_STATUSES.includes(o.status),
                createdAt: o.createdAt,
                lines: o.items.map((i) => ({
                    variantId: i.variantId,
                    title: i.variant?.title ?? "",
                    quantity: i.quantity,
                })),
            })),
        };
    }

    private async reviews(
        productId: string,
        product: ProductDetailDto,
    ): Promise<OverviewReviews> {
        const [published, hiddenCount, toAnswer, latest] = await Promise.all([
            prisma.productReview.findMany({
                where: { productId, status: "PUBLISHED" },
                select: { rating: true },
            }),
            prisma.productReview.count({
                where: { productId, status: "HIDDEN" },
            }),
            prisma.productReview.count({
                where: { productId, status: "PUBLISHED", reply: null },
            }),
            prisma.productReview.findMany({
                where: { productId },
                orderBy: { createdAt: "desc" },
                take: LATEST_REVIEWS,
                select: {
                    id: true,
                    rating: true,
                    body: true,
                    displayName: true,
                    customerId: true,
                    status: true,
                    reply: true,
                    createdAt: true,
                    orderItem: { select: { variantId: true } },
                },
            }),
        ]);
        const titles = new Map(product.variants.map((v) => [v.id, v.title]));
        return {
            summary: ratingSummary(published.map((r) => r.rating)),
            toAnswer,
            hiddenCount,
            latest: latest.map((r) => {
                const variantId = r.orderItem?.variantId ?? null;
                return {
                    id: r.id,
                    rating: r.rating,
                    body: r.body,
                    displayName: r.displayName,
                    customerId: r.customerId,
                    status: r.status === "HIDDEN" ? "HIDDEN" : "PUBLISHED",
                    reply: r.reply,
                    variantId,
                    variantTitle: variantId
                        ? (titles.get(variantId) ?? null)
                        : null,
                    createdAt: r.createdAt,
                };
            }),
        };
    }

    /**
     * The codes that reach this product: set on it, on its category, on its
     * storefront, or on the whole business. Scheduled and live first, ended
     * ones after, so the tab reads "what applies" before "what did".
     */
    private async discounts(
        organizationId: string | null,
        storeId: string,
        product: ProductDetailDto,
        now: Date,
    ): Promise<OverviewDiscount[]> {
        if (!organizationId) return [];
        const rows = await prisma.discount.findMany({
            where: {
                organizationId,
                OR: [
                    { appliesTo: "BUSINESS" },
                    { appliesTo: "STOREFRONT", stores: { some: { storeId } } },
                    {
                        appliesTo: "PRODUCT",
                        products: { some: { productId: product.id } },
                    },
                    ...(product.categoryId
                        ? [
                              {
                                  appliesTo: "COLLECTION",
                                  categories: {
                                      some: { categoryId: product.categoryId },
                                  },
                              },
                          ]
                        : []),
                ],
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                code: true,
                description: true,
                kind: true,
                percentBps: true,
                amount: true,
                appliesTo: true,
                startsAt: true,
                endsAt: true,
                usageLimit: true,
                _count: { select: { redemptions: true } },
                redemptions: {
                    where: {
                        order: { items: { some: { productId: product.id } } },
                    },
                    select: { id: true },
                },
            },
        });
        const rank: Record<string, number> = {
            ACTIVE: 0,
            SCHEDULED: 1,
            EXHAUSTED: 2,
            EXPIRED: 3,
        };
        return rows
            .map((d) => ({
                id: d.id,
                code: d.code,
                description: d.description,
                kind: d.kind,
                percentBps: d.percentBps,
                amount: d.amount ? toMoneyString(d.amount) : null,
                appliesTo: d.appliesTo,
                state: discountState(d, d._count.redemptions, now),
                startsAt: d.startsAt,
                endsAt: d.endsAt,
                usedOnProduct: d.redemptions.length,
            }))
            .sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9));
    }
}

/** The lowest and highest price a customer can pay, and the MRP beside it. */
function priceRange(product: ProductDetailDto): ProductOverview["price"] {
    const prices = product.variants.length
        ? product.variants.map((v) => v.price ?? product.price)
        : [product.price];
    const cents = (s: string) => Number(s.replace(".", ""));
    const sorted = [...prices].sort((a, b) => cents(a) - cents(b));
    const min = sorted[0] ?? product.price;
    const max = sorted[sorted.length - 1] ?? product.price;
    return {
        min,
        max,
        mrp: product.mrp,
        savingPercent: savingPercent(product.price, product.mrp),
    };
}

/** The product's own update time — variants and stock do not bump it. */
function lastChanged(product: ProductDetailDto): Date {
    return product.updatedAt;
}
