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

/**
 * The address as `customerView` answers it. Each part left out stays as it
 * is, null clears it, and `address: null` clears the whole address.
 */
export const customerAddressBody = z.strictObject({
    line1: text(120).nullable().optional(),
    line2: text(120).nullable().optional(),
    city: text(60).nullable().optional(),
    /** In India, a GST state's code ("29") or name ("Karnataka"). */
    state: text(60).nullable().optional(),
    postalCode: text(12).nullable().optional(),
    country: z
        .string()
        .regex(/^[A-Za-z]{2}$/, "An ISO 3166-1 alpha-2 code, like IN")
        .nullable()
        .optional(),
});
export type CustomerAddressBody = z.infer<typeof customerAddressBody>;

export const createCustomerBody = z.strictObject({
    email: z.email().max(254),
    firstName: text(100).optional(),
    lastName: text(100).optional(),
    phone: text(32).optional(),
    company: text(200).optional(),
    address: customerAddressBody.optional(),
});
export type CreateCustomerBody = z.infer<typeof createCustomerBody>;

/** Null clears a field. */
export const patchCustomerBody = z
    .strictObject({
        email: z.email().max(254).optional(),
        firstName: text(100).nullable().optional(),
        lastName: text(100).nullable().optional(),
        phone: text(32).nullable().optional(),
        company: text(200).nullable().optional(),
        address: customerAddressBody.nullable().optional(),
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
