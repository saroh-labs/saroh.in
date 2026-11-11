import { z } from "zod";

import { id, page, pageQuery } from "../common";
import { defineRoute } from "../openapi";
import { idParam, text, timestamp } from "./shared";

/**
 * Customers on `/v1` (plan 2026-11-10-001, U8): list, get, create, update.
 * The answer is a fixed list of fields: nothing `customer:sensitive` (needs
 * attention, notes, a booking's intake note) is ever in it, whoever made
 * the key.
 */

export const customerView = z
    .object({
        id,
        email: z.string(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        phone: z.string().nullable(),
        company: z.string().nullable(),
        address: z
            .object({
                line1: z.string().nullable(),
                line2: z.string().nullable(),
                city: z.string().nullable(),
                state: z.string().nullable(),
                postalCode: z.string().nullable(),
                country: z.string().nullable(),
            })
            .nullable(),
        createdAt: timestamp,
        updatedAt: timestamp,
    })
    .describe("Customer");
export type CustomerView = z.infer<typeof customerView>;

export const createCustomerBody = z.strictObject({
    email: z.email().max(254),
    firstName: text(100).optional(),
    lastName: text(100).optional(),
    phone: text(32).optional(),
    company: text(200).optional(),
});
export type CreateCustomerBody = z.infer<typeof createCustomerBody>;

export const patchCustomerBody = z
    .strictObject({
        email: z.email().max(254).optional(),
        firstName: text(100, 0).optional(),
        lastName: text(100, 0).optional(),
        phone: text(32, 0).optional(),
        company: text(200, 0).optional(),
        addressLine1: text(200, 0).optional(),
        addressLine2: text(200, 0).optional(),
        city: text(100, 0).optional(),
        state: text(100, 0).optional(),
        postalCode: text(16, 0).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, "Send at least one field");
export type PatchCustomerBody = z.infer<typeof patchCustomerBody>;

const customerParams = idParam("customerId");

export const v1ListCustomers = defineRoute({
    method: "get",
    path: "/customers",
    surface: "v1",
    tag: "Customers",
    summary: "List customers",
    request: { query: pageQuery },
    responses: { 200: page(customerView) },
    capability: "contact:read",
});

export const v1GetCustomer = defineRoute({
    method: "get",
    path: "/customers/:customerId",
    surface: "v1",
    tag: "Customers",
    summary: "Get a customer",
    request: { params: customerParams },
    responses: { 200: customerView },
    capability: "contact:read",
});

export const v1CreateCustomer = defineRoute({
    method: "post",
    path: "/customers",
    surface: "v1",
    tag: "Customers",
    summary: "Add a customer",
    request: { body: createCustomerBody },
    responses: { 201: customerView },
    capability: "contact:write",
});

export const v1PatchCustomer = defineRoute({
    method: "patch",
    path: "/customers/:customerId",
    surface: "v1",
    tag: "Customers",
    summary: "Change a customer's details",
    request: { params: customerParams, body: patchCustomerBody },
    responses: { 200: customerView },
    capability: "contact:write",
});
