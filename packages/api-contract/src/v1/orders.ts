import { z } from "zod";

import { id, money, page, pageQuery } from "../common";
import { defineRoute } from "../openapi";
import { idParam, text, timestamp } from "./shared";

/** Orders on `/v1` (plan 2026-11-10-001, U8): list, get, create and status. */

export const ORDER_STATUSES = [
    "PENDING",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
] as const;

export const orderView = z
    .object({
        id,
        /** The storefront's own number, like ORD-001. */
        number: z.string(),
        storefrontId: id,
        customerId: id.nullable(),
        status: z.string(),
        paymentStatus: z.string(),
        stage: z.string(),
        fulfilment: z.string(),
        subtotal: money,
        tax: money,
        shipping: money,
        discount: money,
        total: money,
        items: z.array(
            z.object({
                id,
                productId: id.nullable(),
                variantId: id.nullable(),
                quantity: z.number().int(),
                unitPrice: money,
            }),
        ),
        notes: z.string().nullable(),
        createdAt: timestamp,
        updatedAt: timestamp,
    })
    .describe("Order");
export type OrderView = z.infer<typeof orderView>;

export const listOrdersQuery = pageQuery.extend({
    status: z.enum(ORDER_STATUSES).optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;

export const createOrderBody = z
    .strictObject({
        items: z
            .array(
                z.strictObject({
                    productId: id,
                    variantId: id.optional(),
                    quantity: z.number().int().min(1).max(10_000),
                }),
            )
            .min(1)
            .max(100),
        /** Who it is for: an existing customer, or someone new by email. */
        contactId: id.optional(),
        customer: z
            .strictObject({
                email: z.email().max(254),
                name: text(200).optional(),
            })
            .optional(),
        notes: text(1000, 0).optional(),
        /** The storefront that sells it; left out, the business's only one. */
        storefrontId: id.optional(),
    })
    .refine(
        (b) => (b.contactId === undefined) !== (b.customer === undefined),
        "Name who it is for: contactId or customer, one of them",
    );
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderStatusBody = z.strictObject({
    status: z.enum(ORDER_STATUSES),
});
export type OrderStatusBody = z.infer<typeof orderStatusBody>;

const orderParams = idParam("orderId");

export const v1ListOrders = defineRoute({
    method: "get",
    path: "/orders",
    surface: "v1",
    tag: "Orders",
    summary: "List orders",
    request: { query: listOrdersQuery },
    responses: { 200: page(orderView) },
    capability: "order:read",
});

export const v1GetOrder = defineRoute({
    method: "get",
    path: "/orders/:orderId",
    surface: "v1",
    tag: "Orders",
    summary: "Get an order",
    request: { params: orderParams },
    responses: { 200: orderView },
    capability: "order:read",
});

export const v1CreateOrder = defineRoute({
    method: "post",
    path: "/orders",
    surface: "v1",
    tag: "Orders",
    summary: "Create an order, left unpaid",
    request: { body: createOrderBody },
    responses: { 201: orderView },
    capability: "order:create",
});

export const v1SetOrderStatus = defineRoute({
    method: "post",
    path: "/orders/:orderId/status",
    surface: "v1",
    tag: "Orders",
    summary: "Change an order's status",
    request: { params: orderParams, body: orderStatusBody },
    responses: { 200: orderView },
    // Cancelling also needs `order:refund`, checked on the request.
    capability: "order:edit",
});
