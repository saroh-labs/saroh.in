import { z } from "zod";

import { listInput, nextCursor } from "./catalogue";
import { untrustedText } from "./core";
import { includeContact } from "./day";
import type { RANGE_PERIODS } from "./periods";
import { periodInput } from "./periods";

/**
 * The summary tools (plan 2026-11-13-001, U4): the business at a glance,
 * what sells, what needs doing, customers who stopped coming, and the
 * team. Served to Ask AI and to outside AI apps alike. A figure the
 * person's role can't see is null and named in `not_shown`, never zero.
 * Money is readable text ("INR 180.00"). Output schemas are listed open
 * (`mcp/open-output.ts`), so a field added later doesn't break an app.
 */

/** Money as a person reads it, one entry per currency. */
const amounts = z.array(z.string());

/**
 * What is owed now, as Home and Insights count it (owed by age, DEC-171):
 * every issued bill not an order's own. Overdue is past its due date; not
 * due yet is due later or has no due date. The two add up to `bills`.
 */
const owed = z.object({
    totals: amounts.nullable(),
    bills: z.number(),
    overdue: z.number(),
    overdue_totals: amounts.nullable(),
    not_due: z.number(),
    not_due_totals: amounts.nullable(),
});

export const SUMMARY_PERIODS = [
    "today",
    "this_week",
    "last_week",
    "this_month",
] as const;

export const getBusinessSummaryTool = {
    input: z
        .object({
            period: z
                .enum(SUMMARY_PERIODS)
                .optional()
                .describe("Default today. Weeks start Monday."),
        })
        .strict(),
    output: z.object({
        period: z.string(),
        timezone: z.string(),
        from: z.string(),
        to: z.string(),
        bookings: z.number().nullable(),
        came: z.number().nullable(),
        no_show: z.number().nullable(),
        orders: z.number().nullable(),
        money_in: amounts.nullable(),
        owed: owed.nullable(),
        not_shown: z.array(z.string()),
    }),
};

export const SELLING_PERIODS = [
    "last_7_days",
    "last_4_weeks",
    "last_3_months",
    "this_month",
    "last_month",
] as const;

/** get_whats_selling's own periods, then the shared ones it also takes. */
export const SELLS_ANY_PERIODS = [
    ...SELLING_PERIODS,
    "today",
    "this_week",
    "last_week",
    "last_6_months",
    "this_year",
] as const satisfies readonly (
    (typeof SELLING_PERIODS)[number] | (typeof RANGE_PERIODS)[number]
)[];

export const getWhatsSellingTool = {
    input: z
        .object({
            period: z
                .enum(SELLS_ANY_PERIODS)
                .optional()
                .describe(
                    "Default last_4_weeks. this_month and last_month are calendar months in the business's time zone. Or from and to.",
                ),
            from: periodInput.from,
            to: periodInput.to,
        })
        .strict(),
    output: z.object({
        period: z.string(),
        from: z.string(),
        to: z.string(),
        best_sellers: z.array(
            z.object({
                product_id: z.string(),
                name: z.string(),
                sold: z.number(),
                sold_before: z.number(),
                amount: z.string().nullable(),
            }),
        ),
        /** With no best sellers: the day of the last product sold, or null for none ever. */
        last_sale_on: z.string().nullable(),
        booked: z.array(
            z.object({
                service_id: z.string(),
                name: z.string(),
                bookings: z.number(),
                full_percent: z.number().nullable(),
            }),
        ),
        busiest: z.string().nullable(),
        quietest: z.string().nullable(),
        customers: z.object({
            total: z.number(),
            returning: z.number(),
            new: z.number(),
            best: z.array(
                z.object({
                    customer_id: z.string().nullable(),
                    name: untrustedText.nullable(),
                    amount: z.string().nullable(),
                    visits: z.number(),
                }),
            ),
        }),
        not_shown: z.array(z.string()),
    }),
};

export const getNeedsAttentionTool = {
    input: z.object({}).strict(),
    output: z.object({
        total: z.number(),
        groups: z.array(
            z.object({
                kind: z.string(),
                what: z.string(),
                count: z.number(),
                late: z.number(),
                totals: amounts.nullable(),
                oldest: z
                    .object({
                        title: untrustedText,
                        who: untrustedText.nullable(),
                        at: z.string().nullable(),
                    })
                    .nullable(),
            }),
        ),
        /** Unpaid bills, counted as get_business_summary counts them. */
        owed: owed.nullable(),
        /** Null when this person isn't shown stock, or it couldn't be read. */
        stock: z
            .object({
                tracked: z.boolean(),
                short: z.array(
                    z.object({
                        product_id: z.string(),
                        name: z.string(),
                        location: z.string(),
                        on_hand: z.number(),
                        promised: z.number(),
                        short: z.number(),
                    }),
                ),
                low: z.array(
                    z.object({
                        product_id: z.string(),
                        name: z.string(),
                        location: z.string(),
                        left: z.number(),
                        alert_at: z.number(),
                    }),
                ),
            })
            .nullable(),
        not_shown: z.array(z.string()),
        unavailable: z.array(z.string()),
    }),
};

export const listUnpaidBillsTool = {
    input: z.object({ ...listInput }).strict(),
    output: z.object({
        /** Null when this person's role doesn't include bills. */
        bills: z
            .array(
                z.object({
                    invoice_id: z.string(),
                    number: z.string().nullable(),
                    customer: untrustedText.nullable(),
                    /** What is left to pay; null without payment:read. */
                    left_to_pay: z.string().nullable(),
                    due_on: z.string().nullable(),
                    /** 0 when not due yet or no due date. */
                    days_late: z.number(),
                }),
            )
            .nullable(),
        /** Every unpaid bill, across pages. */
        total: z.number().nullable(),
        next_cursor: nextCursor,
        not_shown: z.array(z.string()),
    }),
};

export const findLapsedCustomersTool = {
    input: z
        .object({
            days: z
                .number()
                .int()
                .min(7)
                .max(730)
                .optional()
                .describe("Not seen for at least this many days. Default 60."),
            include_contact: includeContact,
            ...listInput,
        })
        .strict(),
    output: z.object({
        days: z.number(),
        customers: z.array(
            z.object({
                customer_id: z.string(),
                name: untrustedText.nullable(),
                last_seen_at: z.string(),
                email: z.string().nullable(),
                phone: z.string().nullable(),
            }),
        ),
        next_cursor: nextCursor,
    }),
};

export const listStaffTool = {
    input: z.object({}).strict(),
    output: z.object({
        staff: z.array(
            z.object({
                staff_id: z.string(),
                name: z.string(),
                title: z.string().nullable(),
                role: z.string().nullable(),
                bookable: z.boolean(),
                locations: z.array(
                    z.object({ location_id: z.string(), name: z.string() }),
                ),
            }),
        ),
    }),
};
