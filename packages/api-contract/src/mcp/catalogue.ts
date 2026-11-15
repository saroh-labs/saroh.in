import { z } from "zod";

import { PRODUCT_STATUSES } from "../v1/catalogue";

/**
 * The MCP catalogue tools (plan 2026-11-10-001, U12): products, services
 * and their weekly hours. Money comes back as readable text ("INR 180.00")
 * and goes in as a number in the currency's main unit. Lists page 20 at a
 * time by default; the pieces here are shared with the day-to-day tools.
 *
 * Every definition is sent to the AI app on each connection, so these stay
 * lean: ids, emails and times are plain bounded strings here, and the tool
 * checks each against the `/v1` contract (`v1Body`) before it acts.
 */

/** An id from an earlier result; its name says which. */
export const toolId = z.string().max(64);

/** What makes a create safe to retry (U8's Idempotency-Key, per connection). */
export const requestId = z
    .string()
    .max(100)
    .describe("New and unique per record (a UUID); reuse it on a retry.");

export const listInput = {
    cursor: z.string().max(512).optional().describe("next_cursor, for more."),
    limit: z.number().int().min(1).max(50).optional().describe("Default 20."),
};

export const nextCursor = z.string().nullable();

/** A price someone sets, in the main unit: 180 or 180.5. */
export const priceInput = z.number().min(0).max(99_999_999);

export const productItem = z.object({
    product_id: z.string(),
    name: z.string(),
    status: z.string(),
    price: z.string(),
    variants: z.array(
        z.object({
            variant_id: z.string(),
            title: z.string(),
            sku: z.string(),
            price: z.string().nullable(),
        }),
    ),
});

const oneProduct = z.object({
    product: productItem.extend({
        description: z.string().nullable(),
        stock: z.number().nullable().describe("Null: not counted."),
    }),
});

export const listProductsTool = {
    input: z
        .object({
            query: z
                .string()
                .max(100)
                .optional()
                .describe("Words in the name."),
            ...listInput,
        })
        .strict(),
    output: z.object({
        products: z.array(productItem),
        /** Every match of the filters, across pages (counted whole). */
        total: z.number(),
        next_cursor: nextCursor,
    }),
};

export const getProductTool = {
    input: z.object({ product_id: toolId }).strict(),
    output: z.object({
        product: oneProduct.shape.product.extend({
            /** Each shelf: the product, or one variant, at one store; empty when stock isn't counted. */
            shelves: z.array(
                z.object({
                    variant_id: z.string().nullable(),
                    variant: z.string().nullable(),
                    location_id: z.string(),
                    location: z.string(),
                    on_hand: z.number(),
                    alert_at: z.number(),
                    need: z.enum(["short", "out", "low"]).nullable(),
                }),
            ),
        }),
    }),
};

export const createProductTool = {
    input: z
        .object({
            request_id: requestId,
            name: z.string().max(200),
            price: priceInput,
            currency: z
                .string()
                .max(3)
                .optional()
                .describe("Default: the business's."),
            description: z.string().max(5000).optional(),
            status: z
                .enum(["draft", "published"])
                .optional()
                .describe("Default draft: not on sale."),
            storefront_id: toolId.optional().describe("If it has several."),
        })
        .strict(),
    output: oneProduct,
};

export const updateProductTool = {
    input: z
        .object({
            product_id: toolId,
            name: z.string().max(200).optional(),
            price: priceInput.optional(),
            description: z.string().max(5000).optional(),
            status: z.enum(PRODUCT_STATUSES).optional(),
            stock: z.number().int().min(0).max(1_000_000_000).optional(),
        })
        .strict(),
    output: oneProduct,
};

export const serviceItem = z.object({
    service_id: z.string(),
    name: z.string(),
    duration_minutes: z.number(),
    price: z.string().nullable(),
    capacity: z.number().describe("Above 1: a class."),
    status: z.string(),
    timezone: z.string(),
});
const oneService = z.object({ service: serviceItem });

export const listServicesTool = {
    input: z.object(listInput).strict(),
    output: z.object({
        services: z.array(serviceItem),
        next_cursor: nextCursor,
    }),
};

const serviceFields = {
    name: z.string().max(128),
    duration_minutes: z.number().int().min(1).max(1440),
    price: priceInput.optional(),
    description: z.string().max(2000).optional(),
    capacity: z.number().int().min(1).max(10_000).optional(),
};

export const createServiceTool = {
    input: z.object({ request_id: requestId, ...serviceFields }).strict(),
    output: oneService,
};

export const updateServiceTool = {
    input: z
        .object({
            service_id: toolId,
            ...serviceFields,
            name: serviceFields.name.optional(),
            duration_minutes: serviceFields.duration_minutes.optional(),
        })
        .strict(),
    output: oneService,
};

export const WEEKDAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

/** "09:00"; "24:00" is midnight at the day's end. */
const clock = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/);

const hoursOutput = z.object({
    service_id: z.string(),
    timezone: z.string(),
    hours: z.array(
        z.object({ day: z.string(), opens: z.string(), closes: z.string() }),
    ),
});

export const getHoursTool = {
    input: z.object({ service_id: toolId }).strict(),
    output: hoursOutput,
};

export const setHoursTool = {
    input: z
        .object({
            service_id: toolId,
            hours: z
                .array(
                    z
                        .object({
                            day: z.enum(WEEKDAYS),
                            opens: clock,
                            closes: clock,
                        })
                        .strict(),
                )
                .max(100)
                .describe("The whole week; a day left out is closed."),
        })
        .strict(),
    output: hoursOutput,
};
