import type {
    AskAiInfoCard,
    AskAiProductsCard,
    AskAiTableCard,
    findLapsedCustomersTool,
    getClassFillTool,
    getProductTool,
    getWhatsSellingTool,
    listBookingsTool,
    listClassPacksTool,
    listCustomersTool,
    listOrdersTool,
    listProductsTool,
    listUnpaidBillsTool,
    listWaitlistTool,
    summariseBookingsTool,
    summariseInvoicesTool,
    summariseOrdersTool,
    summariseStockTool,
} from "@saroh/api-contract";
import { ASK_AI_CARD_ITEMS } from "@saroh/api-contract";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";
import type { z } from "zod";

import { moneyWords } from "../../../common/words-format";
import { COUNTING_ROWS } from "../../stock/tracking";
import {
    appLink,
    dateFilter,
    INSIGHTS_PERIOD,
    instantSpan,
    pageLink,
} from "./app-links";

/**
 * Ask AI's answer cards (14 Nov): what a read tool found, drawn under the
 * answer as products or a small table, built here from the tool's own
 * structured result, so a card holds only what the tool's text already
 * gave this person (its omissions for their role included). The model's
 * text never draws an image or a link; a card does, and only these:
 * a product's cover on Saroh's own media host, and the app's own pages.
 */

type Out<T extends { output: z.ZodType }> = z.infer<T["output"]>;

/** What a products card reads beyond the tool's result. */
export interface ProductFacts {
    image: string | null;
    price: string | null;
    stock: number | null;
}

/** The tools that draw products; their ids are read for {@link ProductFacts}. */
export const PRODUCT_CARD_TOOLS = new Set([
    "get_whats_selling",
    "list_products",
    "get_product",
]);

/**
 * `url` when it is on Saroh's own media host (`base`, the storage's public
 * address), else null: a tenant's pasted or library URL never reaches a
 * card. No base configured: none.
 */
export function ownMediaUrl(
    url: string | null | undefined,
    base: string | undefined,
): string | null {
    if (!url || !base) return null;
    try {
        const u = new URL(url);
        const b = new URL(base);
        const path = b.pathname.endsWith("/") ? b.pathname : `${b.pathname}/`;
        return u.protocol === "https:" &&
            u.origin === b.origin &&
            !u.username &&
            !u.password &&
            u.pathname.startsWith(path)
            ? u.toString()
            : null;
    } catch {
        return null;
    }
}

const productHref = (id: string) => appLink("product", {}, id) ?? "";
const invoiceHref = (id: string) => appLink("invoice", {}, id);
const orderHref = (id: string) => appLink("order", {}, id);
const bookingHref = (id: string) => appLink("booking", {}, id);
const contactHref = (id: string | null) => appLink("customer", {}, id);

/** The Orders screen with list_orders' days. */
export const ordersHref = (input: { from?: string; to?: string } | undefined) =>
    pageLink("orders", dateFilter(instantSpan(input)));

/** The Invoices screen's tab for a summary's status, where it has one. */
const INVOICE_TAB: Record<string, string> = {
    paid: "paid",
    unpaid: "due",
    overdue: "overdue",
};
/** The Invoices screen: a status's tab, issued in the period's days. */
export const invoicesHref = (
    status?: string,
    span?: { period?: string; from?: string; to?: string },
) =>
    pageLink("invoices", {
        tab: status ? INVOICE_TAB[status] : undefined,
        ...dateFilter(span ?? {}),
    });

// shortcut: an instant is read on its own offset (the tools send UTC), so near midnight it can be the business's next or last day; pass the zone in if that matters.
function day(iso: string | null): string {
    if (!iso) return "";
    const at = DateTime.fromISO(iso, { setZone: true });
    return at.isValid ? at.toFormat("d LLL") : iso;
}

const capped = <T>(rows: readonly T[], total = rows.length) => ({
    shown: rows.slice(0, ASK_AI_CARD_ITEMS),
    more: Math.max(0, total - Math.min(rows.length, ASK_AI_CARD_ITEMS)),
});

const withMore = (more: number) => (more > 0 ? { more } : {});

function products(
    title: string,
    items: AskAiProductsCard["items"],
    total: number,
    link: AskAiProductsCard["link"],
): AskAiInfoCard | null {
    if (!items.length) return null;
    const { shown, more } = capped(items, total);
    return {
        kind: "products",
        data: { title, items: shown, ...withMore(more), link },
    };
}

function table(
    card: Omit<AskAiTableCard, "rows" | "more" | "hrefs">,
    rows: string[][],
    total = rows.length,
    hrefs?: (string | null)[],
): AskAiInfoCard | null {
    if (!rows.length) return null;
    const { shown, more } = capped(rows, total);
    const links = hrefs?.slice(0, shown.length);
    return {
        kind: "table",
        data: {
            ...card,
            rows: shown,
            ...(links?.some(Boolean) ? { hrefs: links } : {}),
            ...withMore(more),
        },
    };
}

/** Columns a role or the question left out (all null) are dropped. */
function present<T>(
    cols: readonly { name: string; cell: (row: T) => string | null }[],
    rows: readonly T[],
) {
    const kept = cols.filter((c) => rows.some((r) => c.cell(r) !== null));
    return {
        columns: kept.map((c) => c.name),
        rows: rows.map((r) => kept.map((c) => c.cell(r) ?? "")),
    };
}

/**
 * The card for one read tool's result, or null when it draws none (or
 * found nothing). `facts` are the products' own (cover, price, stock),
 * read only for a person who may see products; `mediaBase` is the media
 * host a cover must be on.
 */
export function answerCard(
    tool: string,
    data: unknown,
    facts: ReadonlyMap<string, ProductFacts>,
    mediaBase: string | undefined,
    /** What the tool was called with: a list's link carries its filters. */
    input?: unknown,
): AskAiInfoCard | null {
    const fact = (id: string) => facts.get(id);
    const image = (id: string) => ownMediaUrl(fact(id)?.image, mediaBase);
    switch (tool) {
        case "get_whats_selling": {
            const d = data as Out<typeof getWhatsSellingTool>;
            return products(
                `Best sellers, ${day(d.from)} to ${day(d.to)}`,
                d.best_sellers.map((p) => ({
                    id: p.product_id,
                    name: p.name,
                    imageUrl: image(p.product_id),
                    price: fact(p.product_id)?.price ?? null,
                    sold: p.sold,
                    amount: p.amount,
                    stock: fact(p.product_id)?.stock ?? null,
                    href: productHref(p.product_id),
                })),
                d.best_sellers.length,
                {
                    label: "Open in Insights",
                    href: pageLink("insights", {
                        tab: "sells",
                        period: INSIGHTS_PERIOD[d.period],
                    }),
                },
            );
        }
        case "list_products": {
            const d = data as Out<typeof listProductsTool>;
            return products(
                "Products",
                d.products.map((p) => ({
                    id: p.product_id,
                    name: p.name,
                    imageUrl: image(p.product_id),
                    price: p.price,
                    sold: null,
                    amount: null,
                    stock: fact(p.product_id)?.stock ?? null,
                    href: productHref(p.product_id),
                })),
                d.total,
                {
                    label: "Open in Products",
                    href: pageLink("products"),
                },
            );
        }
        case "get_product": {
            const p = (data as Out<typeof getProductTool>).product;
            return products(
                p.name,
                [
                    {
                        id: p.product_id,
                        name: p.name,
                        imageUrl: image(p.product_id),
                        price: p.price,
                        sold: null,
                        amount: null,
                        stock: p.stock,
                        href: productHref(p.product_id),
                    },
                ],
                1,
                undefined,
            );
        }
        case "list_unpaid_bills": {
            const d = data as Out<typeof listUnpaidBillsTool>;
            if (!d.bills) return null;
            const t = present(
                [
                    { name: "Bill", cell: (b) => b.number ?? "Bill" },
                    { name: "Customer", cell: (b) => b.customer?.text ?? "" },
                    { name: "Owed", cell: (b) => b.left_to_pay },
                    {
                        name: "Due",
                        cell: (b) =>
                            b.days_late > 0
                                ? `${b.days_late} day${b.days_late === 1 ? "" : "s"} late`
                                : b.due_on
                                  ? `Due ${day(b.due_on)}`
                                  : "No due date",
                    },
                ] satisfies {
                    name: string;
                    cell: (
                        b: NonNullable<typeof d.bills>[number],
                    ) => string | null;
                }[],
                d.bills,
            );
            return table(
                {
                    title: "Unpaid bills",
                    columns: t.columns,
                    numeric: numericOf(t.columns, ["Owed"]),
                    link: {
                        label: "Open in Invoices",
                        href: pageLink("invoices", { view: "owed" }),
                    },
                },
                t.rows,
                d.total ?? d.bills.length,
                d.bills.map((b) => invoiceHref(b.invoice_id)),
            );
        }
        case "list_orders": {
            const d = data as Out<typeof listOrdersTool>;
            const t = present(
                [
                    { name: "Order", cell: (o) => o.number },
                    { name: "Placed", cell: (o) => day(o.created_at) },
                    { name: "Step", cell: (o) => words(o.stage) },
                    { name: "Payment", cell: (o) => words(o.payment_status) },
                    { name: "Total", cell: (o) => o.total },
                ] satisfies {
                    name: string;
                    cell: (o: (typeof d.orders)[number]) => string | null;
                }[],
                d.orders,
            );
            return table(
                {
                    title: "Orders",
                    columns: t.columns,
                    numeric: numericOf(t.columns, ["Total"]),
                    link: {
                        label: "Open in Orders",
                        href: ordersHref(
                            input as z.infer<(typeof listOrdersTool)["input"]>,
                        ),
                    },
                },
                t.rows,
                d.total,
                d.orders.map((o) => orderHref(o.order_id)),
            );
        }
        case "list_bookings": {
            const d = data as Out<typeof listBookingsTool>;
            const t = present(
                [
                    { name: "When", cell: (b) => b.when },
                    { name: "Service", cell: (b) => b.service },
                    {
                        name: "Customer",
                        cell: (b) => b.customer_name?.text ?? "",
                    },
                    { name: "Email", cell: (b) => b.customer_email },
                    { name: "Phone", cell: (b) => b.customer_phone },
                ] satisfies {
                    name: string;
                    cell: (b: (typeof d.bookings)[number]) => string | null;
                }[],
                d.bookings,
            );
            return table(
                {
                    title: "Bookings",
                    columns: t.columns,
                    link: {
                        label: "Open in Bookings",
                        href: pageLink(
                            "bookings",
                            dateFilter(
                                instantSpan(
                                    input as
                                        | { from?: string; to?: string }
                                        | undefined,
                                ),
                            ),
                        ),
                    },
                },
                t.rows,
                d.total,
                d.bookings.map((b) => bookingHref(b.booking_id)),
            );
        }
        case "find_lapsed_customers": {
            const d = data as Out<typeof findLapsedCustomersTool>;
            const t = present(
                [
                    { name: "Customer", cell: (c) => c.name?.text ?? "" },
                    { name: "Last seen", cell: (c) => day(c.last_seen_at) },
                    { name: "Email", cell: (c) => c.email },
                    { name: "Phone", cell: (c) => c.phone },
                ] satisfies {
                    name: string;
                    cell: (c: (typeof d.customers)[number]) => string | null;
                }[],
                d.customers,
            );
            return table(
                {
                    title: `Not seen for ${d.days} days or more`,
                    columns: t.columns,
                    link: {
                        label: "Open in Customers",
                        href: pageLink("customers"),
                    },
                },
                t.rows,
                d.total,
                d.customers.map((c) => contactHref(c.customer_id)),
            );
        }
        case "list_customers": {
            const d = data as Out<typeof listCustomersTool>;
            const t = present(
                [
                    { name: "Customer", cell: (c) => c.name?.text ?? "" },
                    { name: "Company", cell: (c) => c.company?.text ?? null },
                    { name: "Email", cell: (c) => c.email },
                    { name: "Phone", cell: (c) => c.phone },
                ] satisfies {
                    name: string;
                    cell: (c: (typeof d.customers)[number]) => string | null;
                }[],
                d.customers,
            );
            return table(
                {
                    title: "Customers",
                    columns: t.columns,
                    link: {
                        label: "Open in Customers",
                        href: pageLink("customers"),
                    },
                },
                t.rows,
                d.total,
                d.customers.map((c) => contactHref(c.customer_id)),
            );
        }
        case "summarise_orders": {
            const d = data as Out<typeof summariseOrdersTool>;
            const t = present(
                [
                    { name: "Order", cell: (o) => o.number },
                    { name: "Customer", cell: (o) => o.customer?.text ?? "" },
                    { name: "Total", cell: (o) => o.total },
                    { name: "Status", cell: (o) => words(o.status) },
                    { name: "Placed", cell: (o) => day(o.placed_on) },
                ] satisfies {
                    name: string;
                    cell: (o: (typeof d.first)[number]) => string | null;
                }[],
                d.first,
            );
            return table(
                {
                    title: `Orders, ${day(d.span.from)} to ${day(d.span.to)}`,
                    columns: t.columns,
                    numeric: numericOf(t.columns, ["Total"]),
                    link: {
                        label: "Open in Orders",
                        href: pageLink("orders", dateFilter(d.span)),
                    },
                },
                t.rows,
                d.orders,
                d.first.map((o) => orderHref(o.order_id)),
            );
        }
        case "summarise_invoices": {
            const d = data as Out<typeof summariseInvoicesTool>;
            const t = present(
                [
                    { name: "Bill", cell: (i) => i.number ?? "Bill" },
                    { name: "Customer", cell: (i) => i.customer?.text ?? "" },
                    { name: "Amount", cell: (i) => i.amount },
                    { name: "Status", cell: (i) => words(i.status) },
                    { name: "Issued", cell: (i) => day(i.issued_on) },
                ] satisfies {
                    name: string;
                    cell: (i: (typeof d.first)[number]) => string | null;
                }[],
                d.first,
            );
            const only = d.by_status.length === 1 ? d.by_status[0] : null;
            return table(
                {
                    title: `Invoices, ${day(d.span.from)} to ${day(d.span.to)}`,
                    columns: t.columns,
                    numeric: numericOf(t.columns, ["Amount"]),
                    link: {
                        label: "Open in Invoices",
                        href: invoicesHref(only?.status, d.span),
                    },
                },
                t.rows,
                d.invoices ?? d.first.length,
                d.first.map((i) => invoiceHref(i.invoice_id)),
            );
        }
        case "summarise_stock": {
            const d = data as Out<typeof summariseStockTool>;
            const t = present(
                [
                    { name: "Product", cell: (p) => p.name },
                    { name: "On hand", cell: (p) => String(p.on_hand) },
                    { name: "Value", cell: (p) => p.value },
                ] satisfies {
                    name: string;
                    cell: (p: (typeof d.top)[number]) => string | null;
                }[],
                d.top,
            );
            return table(
                {
                    title: "Stock on hand",
                    columns: t.columns,
                    numeric: numericOf(t.columns, ["On hand", "Value"]),
                    link: {
                        label: "Open in Stock",
                        // On hand is now: the levels, not the period's log.
                        href: pageLink("stock", { tab: "levels" }),
                    },
                },
                t.rows,
                d.products,
                d.top.map((p) => appLink("product", {}, p.product_id)),
            );
        }
        case "summarise_bookings": {
            const d = data as Out<typeof summariseBookingsTool>;
            const t = present(
                [
                    { name: "When", cell: (b) => b.when },
                    { name: "Service", cell: (b) => b.service },
                    { name: "Customer", cell: (b) => b.customer?.text ?? "" },
                    { name: "Status", cell: (b) => b.status },
                ] satisfies {
                    name: string;
                    cell: (b: (typeof d.first)[number]) => string | null;
                }[],
                d.first,
            );
            return table(
                {
                    title: `Bookings, ${day(d.span.from)} to ${day(d.span.to)}`,
                    columns: t.columns,
                    link: {
                        label: "Open in Bookings",
                        href: pageLink("bookings", dateFilter(d.span)),
                    },
                },
                t.rows,
                d.all,
                d.first.map((b) => bookingHref(b.booking_id)),
            );
        }
        case "get_class_fill": {
            const d = data as Out<typeof getClassFillTool>;
            return table(
                {
                    title: `Classes, ${day(d.span.from)} to ${day(d.span.to)}`,
                    columns: ["Class", "Sessions", "Booked", "Places", "Full"],
                    numeric: [1, 2, 3, 4],
                    link: {
                        label: "Open in Calendar",
                        // The week view from the period's first day.
                        href: pageLink("calendar", {
                            view: "week",
                            day: d.span.from,
                        }),
                    },
                },
                d.classes.map((c) => [
                    c.name,
                    String(c.sessions),
                    String(c.booked),
                    String(c.places),
                    c.full_percent === null ? "" : `${c.full_percent}%`,
                ]),
            );
        }
        case "list_waitlist": {
            const d = data as Out<typeof listWaitlistTool>;
            const rows = d.sessions.flatMap((x) =>
                x.waiting.map((w) => ({
                    ...w,
                    service: x.service,
                    when: x.when,
                })),
            );
            return table(
                {
                    title: "Waitlist",
                    columns: ["Class", "When", "Place", "Customer", "Status"],
                    numeric: [2],
                    link: {
                        label: "Open in Bookings",
                        href: pageLink("bookings"),
                    },
                },
                rows.map((w) => [
                    w.service,
                    w.when,
                    String(w.position),
                    w.name?.text ?? "",
                    w.status === "offered" ? "Offered a place" : "Waiting",
                ]),
                d.people,
                rows.map((w) => contactHref(w.customer_id)),
            );
        }
        case "list_class_packs": {
            const d = data as Out<typeof listClassPacksTool>;
            return table(
                {
                    title: d.span
                        ? `Class packs to use by ${day(d.span.from)} to ${day(d.span.to)}`
                        : "Class packs held",
                    columns: ["Customer", "Pack", "Left", "Use by", "Status"],
                    numeric: [2],
                    link: {
                        label: "Open in Class packs",
                        href: pageLink("classPacks"),
                    },
                },
                d.packs.map((p) => [
                    p.customer?.text ?? "",
                    p.pack,
                    `${p.left} of ${p.classes}`,
                    day(p.use_by),
                    words(p.standing),
                ]),
                d.total,
                d.packs.map((p) => contactHref(p.customer_id)),
            );
        }
        default:
            return null;
    }
}

/** A tool's lower_case word as a person reads it: "ready_for_pickup" → "Ready for pickup". */
function words(value: string): string {
    const s = value.replace(/_/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function numericOf(columns: readonly string[], names: readonly string[]) {
    const at = columns.flatMap((c, i) => (names.includes(c) ? [i] : []));
    return at.length ? at : undefined;
}

/** The product ids a products card would draw, for {@link productFacts}. */
export function productIdsOf(tool: string, data: unknown): string[] {
    switch (tool) {
        case "get_whats_selling":
            return (data as Out<typeof getWhatsSellingTool>).best_sellers
                .slice(0, ASK_AI_CARD_ITEMS)
                .map((p) => p.product_id);
        case "list_products":
            return (data as Out<typeof listProductsTool>).products
                .slice(0, ASK_AI_CARD_ITEMS)
                .map((p) => p.product_id);
        case "get_product":
            return [(data as Out<typeof getProductTool>).product.product_id];
        default:
            return [];
    }
}

/**
 * The products' cover, price and units in stock across every shelf
 * (variants too), as the business; stock null when it isn't counted.
 * Read only for someone who may see products (`store:read`).
 */
export async function productFacts(
    organizationId: string,
    ids: readonly string[],
): Promise<Map<string, ProductFacts>> {
    if (!ids.length) return new Map();
    const [rows, stock] = await outsideOrgContext(() =>
        runInOrgContext(organizationId, () =>
            Promise.all([
                prisma.product.findMany({
                    where: { organizationId, id: { in: [...ids] } },
                    select: {
                        id: true,
                        image: true,
                        price: true,
                        currency: true,
                    },
                }),
                prisma.stockLevel.groupBy({
                    by: ["productId"],
                    where: {
                        organizationId,
                        productId: { in: [...ids] },
                        ...COUNTING_ROWS,
                    },
                    _sum: { onHand: true },
                }),
            ]),
        ),
    );
    const left = new Map(stock.map((s) => [s.productId, s._sum.onHand]));
    return new Map(
        rows.map((p) => [
            p.id,
            {
                image: p.image,
                price: moneyWords(p.price, p.currency),
                stock: left.get(p.id) ?? null,
            },
        ]),
    );
}
