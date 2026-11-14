import { z } from "zod";

import { untrustedText } from "./core";

/**
 * The period summaries (14 Nov): orders, invoices, stock and bookings over
 * a named period or a span of days, totalled by Saroh in SQL so an AI app
 * never adds up rows. Each states the exact days it used. Output schemas
 * are listed open (`mcp/open-output.ts`). Money is readable text, one
 * entry per currency; a figure the role can't see is null and named in
 * `not_shown`.
 */

/** Calendar units whole (weeks start Monday); the last 3 or 6 months end today. */
export const RANGE_PERIODS = [
    "today",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_3_months",
    "last_6_months",
    "this_year",
] as const;
export type RangePeriod = (typeof RANGE_PERIODS)[number];

/** The longest span of days a summary reads. */
export const RANGE_MAX_DAYS = 366;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a day as YYYY-MM-DD");

/** The shared period input: a named period, or from/to days in the business's zone. */
export const periodInput = {
    period: z
        .enum(RANGE_PERIODS)
        .optional()
        .describe("Default this_month. Or give from and to instead."),
    from: isoDay
        .optional()
        .describe("First day, YYYY-MM-DD; up to a year with to."),
    to: isoDay.optional().describe("Last day, YYYY-MM-DD. Default today."),
};

/** The exact days a summary used, and the equal period before it. */
const span = z.object({
    period: z.string(),
    timezone: z.string(),
    from: z.string(),
    to: z.string(),
    before_from: z.string(),
    before_to: z.string(),
});

const amounts = z.array(z.string());
const count = z.object({ key: z.string(), count: z.number() });
const bucket = z.object({
    /** First day of the week or month, YYYY-MM-DD. */
    starts: z.string(),
    count: z.number(),
    amount: amounts.nullable(),
});

export const summariseOrdersTool = {
    input: z.object(periodInput).strict(),
    output: z.object({
        span,
        orders: z.number(),
        standing: z.number(),
        cancelled: z.number(),
        /** Standing orders' totals; null without payments. */
        amount: amounts.nullable(),
        before: z.object({
            orders: z.number(),
            amount: amounts.nullable(),
        }),
        by_status: z.array(count),
        by: z.enum(["day", "week", "month"]),
        buckets: z.array(bucket),
        top_products: z.array(
            z.object({
                product_id: z.string(),
                name: z.string(),
                sold: z.number(),
            }),
        ),
        /** A product's size or colour, by units on standing orders. */
        top_variants: z.array(
            z.object({
                product_id: z.string(),
                variant_id: z.string(),
                name: z.string(),
                variant: z.string(),
                sold: z.number(),
            }),
        ),
        /** Orders placed at each store (location), cancelled included. */
        by_location: z.array(
            z.object({
                location_id: z.string(),
                name: z.string(),
                orders: z.number(),
                standing: z.number(),
            }),
        ),
        first: z.array(
            z.object({
                order_id: z.string(),
                number: z.string(),
                customer: untrustedText.nullable(),
                total: z.string().nullable(),
                status: z.string(),
                placed_on: z.string(),
            }),
        ),
        not_shown: z.array(z.string()),
    }),
};

export const INVOICE_SUMMARY_STATUSES = [
    "paid",
    "unpaid",
    "overdue",
    "cancelled",
    "credit_notes",
] as const;

export const summariseInvoicesTool = {
    input: z
        .object({
            ...periodInput,
            status: z.enum(INVOICE_SUMMARY_STATUSES).optional(),
        })
        .strict(),
    output: z.object({
        span,
        /** Null without invoice:read. */
        invoices: z.number().nullable(),
        by_status: z.array(
            z.object({
                status: z.string(),
                count: z.number(),
                amount: amounts.nullable(),
            }),
        ),
        collected: amounts.nullable(),
        owed: amounts.nullable(),
        by: z.enum(["day", "week", "month"]),
        buckets: z.array(bucket),
        first: z.array(
            z.object({
                invoice_id: z.string(),
                number: z.string().nullable(),
                customer: untrustedText.nullable(),
                amount: z.string().nullable(),
                status: z.string(),
                issued_on: z.string(),
            }),
        ),
        not_shown: z.array(z.string()),
    }),
};

export const summariseStockTool = {
    input: z.object(periodInput).strict(),
    output: z.object({
        span,
        tracked: z.boolean(),
        products: z.number(),
        units: z.number(),
        /** On-hand value at today's price; null without payments. */
        value: amounts.nullable(),
        low: z.number(),
        short: z.number(),
        out: z.number(),
        top: z.array(
            z.object({
                product_id: z.string(),
                name: z.string(),
                on_hand: z.number(),
                value: z.string().nullable(),
            }),
        ),
        /** Shelves (a product or one variant, at one store) needing stock, worst first; the first 40. */
        needs: z.array(
            z.object({
                product_id: z.string(),
                variant_id: z.string().nullable(),
                name: z.string(),
                variant: z.string().nullable(),
                location_id: z.string(),
                location: z.string(),
                on_hand: z.number(),
                alert_at: z.number(),
                need: z.enum(["short", "out", "low"]),
            }),
        ),
        /** Units in and out in the period, from the stock log. */
        moved: z.object({
            received: z.number(),
            sold: z.number(),
            returned: z.number(),
            wasted: z.number(),
            counted: z.number(),
            made: z.number(),
        }),
        not_shown: z.array(z.string()),
    }),
};

export const summariseBookingsTool = {
    input: z.object(periodInput).strict(),
    output: z.object({
        span,
        bookings: z.number(),
        cancelled: z.number(),
        came: z.number(),
        no_show: z.number(),
        not_marked: z.number(),
        before: z.object({ bookings: z.number() }),
        by_service: z.array(count),
        by_staff: z.array(count),
        busiest_days: z.array(count),
        first: z.array(
            z.object({
                booking_id: z.string(),
                when: z.string(),
                service: z.string(),
                customer: untrustedText.nullable(),
                status: z.string(),
            }),
        ),
        not_shown: z.array(z.string()),
    }),
};
