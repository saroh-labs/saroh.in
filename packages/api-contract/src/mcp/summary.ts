import { z } from "zod";

import { listInput, nextCursor } from "./catalogue";
import { untrustedText } from "./core";
import { includeContact } from "./day";

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
        owed: z
            .object({
                totals: amounts.nullable(),
                bills: z.number(),
                overdue: z.number(),
            })
            .nullable(),
        not_shown: z.array(z.string()),
    }),
};

export const SELLING_PERIODS = [
    "last_7_days",
    "last_4_weeks",
    "last_3_months",
] as const;

export const getWhatsSellingTool = {
    input: z
        .object({
            period: z
                .enum(SELLING_PERIODS)
                .optional()
                .describe("Default last_4_weeks."),
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
        unavailable: z.array(z.string()),
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
