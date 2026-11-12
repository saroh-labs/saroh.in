import { z } from "zod";

import { BOOKING_STATUSES } from "../v1/bookings";
import { ORDER_STAGES, ORDER_STATUSES } from "../v1/orders";
import { listInput, nextCursor, requestId, toolId } from "./catalogue";
import { untrustedText } from "./core";

/**
 * The MCP day-to-day tools (plan 2026-11-10-001, U12): bookings, free
 * times, orders, customers and enquiries. Times go in as ISO 8601 with an
 * offset and come back both as ISO and as readable text in the service's
 * time zone. What customers wrote (enquiries, order notes, their names,
 * companies and addresses) is
 * {@link untrustedText}; nothing `customer:sensitive` is in any result.
 * Lean, as `catalogue.ts` says: the tools check against `/v1`'s contract.
 */

/** ISO 8601 with an offset; checked again where it is used. */
const instant = z
    .string()
    .max(40)
    .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d/)
    .describe("ISO 8601 with offset.");

const email = z.string().max(254);

export const bookingItem = z.object({
    booking_id: z.string(),
    service_id: z.string(),
    service: z.string(),
    starts_at: z.string(),
    when: z.string(),
    status: z.string(),
    customer_id: z.string().nullable(),
    customer_name: untrustedText.nullable(),
    customer_email: z.string().nullable(),
    customer_phone: z.string().nullable(),
    staff_id: z.string().nullable(),
});
const oneBooking = z.object({ booking: bookingItem });

export const listBookingsTool = {
    input: z
        .object({
            from: instant.optional().describe("Starting at or after."),
            to: instant.optional().describe("Starting before."),
            status: z.enum(BOOKING_STATUSES).optional(),
            service_id: toolId.optional(),
            customer_id: toolId.optional(),
            ...listInput,
        })
        .strict(),
    output: z.object({
        bookings: z.array(bookingItem),
        next_cursor: nextCursor,
    }),
};

export const getBookingTool = {
    input: z.object({ booking_id: toolId }).strict(),
    output: oneBooking,
};

export const findFreeSlotsTool = {
    input: z
        .object({
            service_id: toolId,
            from: instant,
            to: instant.optional().describe("Default: a day after from."),
            staff_id: toolId.optional(),
        })
        .strict(),
    output: z.object({
        service_id: z.string(),
        timezone: z.string(),
        slots: z.array(
            z.object({
                starts_at: z.string(),
                when: z.string(),
                places_left: z.number().optional(),
            }),
        ),
        more: z.boolean(),
    }),
};

export const createBookingTool = {
    input: z
        .object({
            request_id: requestId,
            service_id: toolId,
            starts_at: instant,
            customer_id: toolId.optional(),
            customer_email: email.optional(),
            customer_name: z.string().max(200).optional(),
            customer_phone: z.string().max(32).optional(),
            staff_id: toolId.optional(),
        })
        .strict(),
    output: oneBooking,
};

export const moveBookingTool = {
    input: z.object({ booking_id: toolId, starts_at: instant }).strict(),
    output: oneBooking,
};

export const orderItem = z.object({
    order_id: z.string(),
    number: z.string(),
    status: z.string(),
    stage: z.string(),
    payment_status: z.string(),
    total: z.string(),
    customer_id: z.string().nullable(),
    created_at: z.string(),
});

const oneOrder = z.object({
    order: orderItem.extend({
        items: z.array(
            z.object({
                product_id: z.string().nullable(),
                variant_id: z.string().nullable(),
                name: z.string().nullable(),
                quantity: z.number(),
                unit_price: z.string(),
            }),
        ),
        notes: untrustedText.nullable(),
    }),
});

export const listOrdersTool = {
    input: z
        .object({ status: z.enum(ORDER_STATUSES).optional(), ...listInput })
        .strict(),
    output: z.object({ orders: z.array(orderItem), next_cursor: nextCursor }),
};

export const getOrderTool = {
    input: z.object({ order_id: toolId }).strict(),
    output: oneOrder,
};

export const createOrderTool = {
    input: z
        .object({
            request_id: requestId,
            items: z
                .array(
                    z
                        .object({
                            product_id: toolId,
                            variant_id: toolId.optional(),
                            quantity: z.number().int().min(1).max(10_000),
                        })
                        .strict(),
                )
                .min(1)
                .max(100),
            customer_id: toolId.optional(),
            customer_email: email.optional(),
            customer_name: z.string().max(200).optional(),
            notes: z.string().max(1000).optional(),
            storefront_id: toolId.optional().describe("If it has several."),
        })
        .strict(),
    output: oneOrder,
};

/** The steps a person moves an order to; "new" is where every order starts. */
type Step = Exclude<(typeof ORDER_STAGES)[number], "new">;
export const ORDER_STEPS = ORDER_STAGES.filter((s) => s !== "new") as [
    Step,
    ...Step[],
];

export const updateOrderStatusTool = {
    input: z.object({ order_id: toolId, stage: z.enum(ORDER_STEPS) }).strict(),
    output: z.object({
        order: orderItem.pick({
            order_id: true,
            number: true,
            status: true,
            stage: true,
        }),
    }),
};

export const customerItem = z.object({
    customer_id: z.string(),
    name: untrustedText.nullable(),
    email: z.string(),
    phone: z.string().nullable(),
    company: untrustedText.nullable(),
});
const oneCustomer = z.object({
    customer: customerItem.extend({ address: untrustedText.nullable() }),
});

export const listCustomersTool = {
    input: z
        .object({
            query: z
                .string()
                .max(100)
                .optional()
                .describe("Part of a name, email, phone or company."),
            ...listInput,
        })
        .strict(),
    output: z.object({
        customers: z.array(customerItem),
        next_cursor: nextCursor,
    }),
};

export const getCustomerTool = {
    input: z.object({ customer_id: toolId }).strict(),
    output: oneCustomer,
};

const contactField = (max: number) => z.string().max(max);

export const createCustomerTool = {
    input: z
        .object({
            request_id: requestId,
            email,
            first_name: contactField(100).optional(),
            last_name: contactField(100).optional(),
            phone: contactField(32).optional(),
            company: contactField(200).optional(),
        })
        .strict(),
    output: oneCustomer,
};

export const updateCustomerTool = {
    input: z
        .object({
            customer_id: toolId,
            email: email.optional(),
            first_name: contactField(100).nullable().optional(),
            last_name: contactField(100).nullable().optional(),
            phone: contactField(32).nullable().optional(),
            company: contactField(200).nullable().optional(),
        })
        .strict(),
    output: oneCustomer,
};

export const enquiryItem = z.object({
    enquiry_id: z.string(),
    title: untrustedText,
    status: z.string(),
    stage: z.string(),
    customer_id: z.string(),
    received_at: z.string(),
    message: untrustedText.nullable(),
});

export const listEnquiriesTool = {
    input: z.object(listInput).strict(),
    output: z.object({
        enquiries: z.array(enquiryItem),
        next_cursor: nextCursor,
    }),
};

export const getEnquiryTool = {
    input: z.object({ enquiry_id: toolId }).strict(),
    output: z.object({ enquiry: enquiryItem }),
};
