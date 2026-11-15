import type { DatePick } from "@/lib/views/date-range";
import {
    dateRangeAsk,
    dateRangeOn,
    dateRangeWords,
    readDateRange,
    writeDateRange,
} from "@/lib/views/date-range";
import type {
    OrderFilterOptions,
    OrderListParams,
    PaymentStanding,
} from "./business-service";
import type { FulfilmentType } from "./read";

/**
 * The Orders list's filter bar (plan B, B4), after the "Saroh Orders
 * Screen" design: date, step, fulfilment, payment, product, Needs attention
 * (B15) and Late. Every
 * filter lives in the address, so a filtered list is a link someone can
 * share, and the API narrows the rows, the tab counts and the pages alike.
 * Pure: `list-query.ts` reads and writes the address through it, and the
 * bar and the empty state take their words from it.
 */

/** The date menu: the API's presets, and a custom range of days. */
export type OrdersDate = DatePick;

// The date filter is every list's (`lib/views/date-range.ts`).
export { DATE_OPTIONS, dayOrNull } from "@/lib/views/date-range";

/** Payment in the address, lower case as a link reads. */
export type OrdersPayment = "paid" | "unpaid" | "partly-refunded" | "refunded";

export interface OrdersFilters {
    date: OrdersDate | null;
    /** A custom range's days, YYYY-MM-DD in the business's zone. */
    from: string | null;
    to: string | null;
    /** The API's key for what the pill says: "ready", "refunded". */
    step: string | null;
    fulfilment: FulfilmentType | null;
    payment: OrdersPayment | null;
    /** A product id. */
    product: string | null;
    /**
     * Only orders whose customer has Needs attention the viewer may see
     * (B15). The API decides what counts for them.
     */
    attention: boolean;
    late: boolean;
}

export const NO_FILTERS: OrdersFilters = {
    date: null,
    from: null,
    to: null,
    step: null,
    fulfilment: null,
    payment: null,
    product: null,
    attention: false,
    late: false,
};

/** The filter keys, which change what is listed (and so the page). */
export const FILTER_KEYS = Object.keys(NO_FILTERS) as (keyof OrdersFilters)[];

export const PAYMENT_OPTIONS: readonly {
    value: OrdersPayment;
    label: string;
}[] = [
    { value: "paid", label: "Paid" },
    { value: "unpaid", label: "Not paid yet" },
    { value: "partly-refunded", label: "Partly refunded" },
    { value: "refunded", label: "Refunded" },
];

const PAYMENT_STANDING: Record<OrdersPayment, PaymentStanding> = {
    paid: "PAID",
    unpaid: "UNPAID",
    "partly-refunded": "PARTLY_REFUNDED",
    refunded: "REFUNDED",
};

/** The ways the API knows, to read `?fulfilment=` against. */
const FULFILMENT_TYPES: readonly FulfilmentType[] = [
    "PICKUP",
    "LOCAL_DELIVERY",
    "SHIPPING",
    "DIGITAL",
    "APPOINTMENT_IN_PERSON",
    "APPOINTMENT_ONLINE",
];

const STEP_RE = /^[a-z0-9-]{1,40}$/;
const ID_RE = /^[\w-]{1,64}$/;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ? value.trim() : undefined;
}

/**
 * The filters the address asks for. Anything malformed is no filter — a
 * hand-edited link shows more, never an error page — and each value is
 * one the API accepts, since it refuses what it doesn't know.
 */
export function readOrdersFilters(params: Params): OrdersFilters {
    const fulfilment = one(params, "fulfilment")?.toUpperCase();
    const payment = one(params, "payment")?.toLowerCase();
    const step = one(params, "step")?.toLowerCase();
    const product = one(params, "product");
    return {
        ...readDateRange(params),
        step: step && STEP_RE.test(step) ? step : null,
        fulfilment: FULFILMENT_TYPES.find((t) => t === fulfilment) ?? null,
        payment:
            PAYMENT_OPTIONS.find((p) => p.value === payment)?.value ?? null,
        product: product && ID_RE.test(product) ? product : null,
        attention: one(params, "attention") === "true",
        late: one(params, "late") === "true",
    };
}

/** The filters into an address, leaving out what is off. */
export function writeOrdersFilters(
    filters: OrdersFilters,
    q: URLSearchParams,
): void {
    writeDateRange(filters, q);
    if (filters.step) q.set("step", filters.step);
    if (filters.fulfilment) {
        q.set("fulfilment", filters.fulfilment.toLowerCase());
    }
    if (filters.payment) q.set("payment", filters.payment);
    if (filters.product) q.set("product", filters.product);
    if (filters.attention) q.set("attention", "true");
    if (filters.late) q.set("late", "true");
}

/** Whether any filter narrows the list (the bar's Clear filters). */
export function filtersActive(filters: OrdersFilters): boolean {
    return (
        dateRangeOn(filters) ||
        !!filters.step ||
        !!filters.fulfilment ||
        !!filters.payment ||
        !!filters.product ||
        filters.attention ||
        filters.late
    );
}

/**
 * How many filters are on, for the phone's "Filters · 2" (B5): a date
 * counts once whether a preset or a range, and a custom date with no day
 * chosen yet not at all, as {@link filtersActive} reads it.
 */
export function filtersOn(filters: OrdersFilters): number {
    return [
        dateRangeOn(filters),
        !!filters.step,
        !!filters.fulfilment,
        !!filters.payment,
        !!filters.product,
        filters.attention,
        filters.late,
    ].filter(Boolean).length;
}

/** What the API is asked for the filters (B4). */
export function filterParams(
    filters: OrdersFilters,
): Pick<
    OrderListParams,
    | "date"
    | "from"
    | "to"
    | "step"
    | "fulfilment"
    | "payment"
    | "productId"
    | "late"
    | "attention"
> {
    return {
        ...dateRangeAsk(filters),
        step: filters.step ?? undefined,
        fulfilment: filters.fulfilment ? [filters.fulfilment] : undefined,
        payment: filters.payment
            ? PAYMENT_STANDING[filters.payment]
            : undefined,
        productId: filters.product ?? undefined,
        late: filters.late ? true : undefined,
        attention: filters.attention ? true : undefined,
    };
}

/**
 * The Step menu: the words the business's orders show, narrowed to the
 * chosen way's when one is chosen. Refunded and Cancelled stay, since any
 * way's order can be either.
 */
export function stepOptions(
    options: OrderFilterOptions,
    fulfilment: FulfilmentType | null,
): OrderFilterOptions["steps"] {
    if (!fulfilment) return options.steps;
    return options.steps.filter(
        (s) => s.types.length === 0 || s.types.includes(fulfilment),
    );
}

/** "Booking, online" → "online booking": a way as a noun's adjective. */
function typeWords(label: string): string {
    const [head, tail] = label.split(", ");
    return (tail ? `${tail} ${head}` : label).toLowerCase();
}

const PAYMENT_WORDS: Record<OrdersPayment, string> = {
    paid: "paid",
    unpaid: "unpaid",
    "partly-refunded": "partly refunded",
    refunded: "refunded",
};

/**
 * An empty filtered list, said for its filters: "No late unpaid shipping
 * orders at Ready in the last 7 days". The step's, the way's and the
 * product's words are the API's (`options`); without them the sentence
 * leaves that part out rather than guess.
 */
export function filteredEmptyTitle(
    filters: OrdersFilters,
    options: OrderFilterOptions | null,
): string {
    const way = filters.fulfilment
        ? options?.types.find((t) => t.type === filters.fulfilment)?.label
        : undefined;
    const step = filters.step
        ? options?.steps.find((s) => s.key === filters.step)?.label
        : undefined;
    const product =
        filters.product && options?.product?.id === filters.product
            ? options.product.name
            : undefined;

    const words = [
        filters.late ? "late" : null,
        filters.payment ? PAYMENT_WORDS[filters.payment] : null,
        way ? typeWords(way) : null,
        "orders",
    ];
    // Refunded and Cancelled read as what the order is, not a step it is at.
    if (step) {
        words.push(
            filters.step === "refunded" || filters.step === "cancelled"
                ? `that were ${step.toLowerCase()}`
                : `at ${step}`,
        );
    }
    if (product) words.push(`with ${product}`);
    if (filters.attention) words.push("that need attention");
    words.push(dateRangeWords(filters));
    return `No ${words.filter(Boolean).join(" ")}`;
}
