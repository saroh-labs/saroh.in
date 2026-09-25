import type { ProductDetail } from "@/lib/products/service";

/**
 * The product page's shapes and display rules — pure and client-safe, so a
 * client component (the variants drawer, the review list) can use them
 * without pulling in the server-only read in `overview.ts`. The API does the
 * arithmetic; these only turn its answers into words.
 */

export type StockWord = "IN_STOCK" | "LOW" | "SOLD_OUT";

export interface StockLine {
    onHand: number;
    promised: number;
    canSell: number;
    warnAt: number;
    word: StockWord;
}

/** A panel fails, or is withheld, on its own — never the whole page. */
export type Panel<T> =
    { status: "ok"; data: T } | { status: "failed" } | { status: "forbidden" };

export interface OverviewOrder {
    id: string;
    orderNumber: string;
    customerId: string;
    customer: string;
    status: string;
    open: boolean;
    createdAt: string;
    lines: { variantId: string | null; title: string; quantity: number }[];
}

export interface OverviewReview {
    id: string;
    rating: number;
    body: string | null;
    displayName: string;
    customerId: string | null;
    status: "PUBLISHED" | "HIDDEN";
    reply: string | null;
    variantId: string | null;
    variantTitle: string | null;
    createdAt: string;
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
    startsAt: string | null;
    endsAt: string | null;
    usedOnProduct: number;
}

export interface ProductOverview {
    product: ProductDetail;
    stock: {
        mode: "product" | "variant";
        variants: (StockLine & { variantId: string })[];
        product: StockLine | null;
        totals: {
            onHand: number;
            promised: number;
            canSell: number;
            lowCount: number;
        };
    };
    price: {
        min: string;
        max: string;
        mrp: string | null;
        savingPercent: number | null;
    };
    lastChanged: string;
    storefront: { id: string; name: string };
    canWrite: boolean;
    orders: Panel<{
        openCount: number;
        thisMonthCount: number;
        soldThisMonth: Record<string, number>;
        recent: OverviewOrder[];
    }>;
    reviews: Panel<{
        summary: {
            average: number | null;
            count: number;
            distribution: [number, number, number, number, number];
        };
        toAnswer: number;
        hiddenCount: number;
        latest: OverviewReview[];
    }>;
    discounts: Panel<OverviewDiscount[]>;
}

export const STOCK_WORD_LABEL: Record<StockWord, string> = {
    IN_STOCK: "In stock",
    LOW: "Low",
    SOLD_OUT: "Sold out",
};

/** What customers see for a stock line: "Only 2 left", "Sold out". */
export function customersSee(line: StockLine): string {
    if (line.word === "SOLD_OUT") return "Sold out";
    if (line.word === "LOW") return `Only ${line.canSell} left`;
    return "In stock";
}

/** "1 product", "2 products". */
export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/**
 * The price a product sells at: one price, or the range across its
 * variants, en dash between ("₹499 – ₹899").
 */
export function priceLabel(
    price: ProductOverview["price"],
    format: (amount: string) => string,
): string {
    return price.min === price.max
        ? format(price.min)
        : `${format(price.min)} – ${format(price.max)}`;
}

/** "4.6 from 12" — or null when nobody has reviewed it yet. */
export function ratingLabel(summary: {
    average: number | null;
    count: number;
}): string | null {
    if (summary.average === null || summary.count === 0) return null;
    return `${summary.average.toFixed(1)} from ${summary.count}`;
}

/** The rating spread as percentages of the whole, 5★ first. */
export function ratingBars(
    distribution: [number, number, number, number, number],
): { stars: number; count: number; percent: number }[] {
    const total = distribution.reduce((a, b) => a + b, 0);
    return [5, 4, 3, 2, 1].map((stars) => {
        const count = distribution[stars - 1] ?? 0;
        return {
            stars,
            count,
            percent: total === 0 ? 0 : Math.round((count / total) * 100),
        };
    });
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
    PENDING: "New",
    PROCESSING: "Preparing",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
};

/** A discount as one line: "10% off" or "₹50 off". */
export function discountAmount(
    d: Pick<OverviewDiscount, "kind" | "percentBps" | "amount">,
    format: (amount: string) => string,
): string {
    if (d.kind === "PERCENTAGE" && d.percentBps !== null) {
        const pct = d.percentBps / 100;
        return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% off`;
    }
    return d.amount ? `${format(d.amount)} off` : "Amount off";
}

export const DISCOUNT_REACH_LABEL: Record<string, string> = {
    BUSINESS: "everything in the shop",
    STOREFRONT: "this storefront",
    COLLECTION: "its category",
    PRODUCT: "this product",
};

/** Whether a detail the merchant filled is shown to customers. */
export function onTheShop(
    fields: ProductDetail["shopFields"],
    key: keyof ProductDetail["shopFields"],
): boolean {
    return fields[key] !== false;
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** A custom field's value as people read it: "Yes", "24 Sep 2026", "12". */
export function customFieldText(f: {
    type: "TEXT" | "NUMBER" | "DATE" | "YES_NO";
    value: string | null;
}): string {
    if (f.value === null) return "";
    if (f.type === "YES_NO") return f.value === "true" ? "Yes" : "No";
    if (f.type === "DATE") {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.value);
        return m
            ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`
            : f.value;
    }
    return f.value;
}

/** "Contains gluten. May contain nuts, sesame." — or "" when none are ticked. */
export function allergenLine(a: {
    contains: { name: string }[];
    mayContain: { name: string }[];
}): string {
    const list = (x: { name: string }[]) =>
        x.map((y) => y.name.toLowerCase()).join(", ");
    return [
        a.contains.length ? `Contains ${list(a.contains)}.` : "",
        a.mayContain.length ? `May contain ${list(a.mayContain)}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
}
