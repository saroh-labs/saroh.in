import { z } from "zod";

import { id, money, openEnum, page, pageQuery } from "../common";
import { defineRoute } from "../openapi";
import { idParam, price, text, timestamp } from "./shared";

/**
 * Catalogue on `/v1` (plan 2026-11-10-001, U8): products, their variants,
 * prices and stock; services and their hours; posts and subscription plans
 * to read.
 */

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export const productStatus = openEnum(
    PRODUCT_STATUSES,
    "Whether it is on sale: only published is",
);
export const SERVICE_STATUSES = ["active", "archived"] as const;
export const POST_STATUSES = ["draft", "published", "archived"] as const;
export const PLAN_STATUSES = ["draft", "active", "archived"] as const;
export const PLAN_INTERVALS = ["week", "month", "quarter", "year"] as const;
export const planInterval = openEnum(PLAN_INTERVALS, "How often it is paid");

export const variantView = z.object({
    id,
    sku: z.string(),
    title: z.string(),
    /** Null: the product's price. */
    price: money.nullable(),
});
export type VariantView = z.infer<typeof variantView>;

export const productView = z
    .object({
        id,
        name: z.string(),
        slug: z.string(),
        description: z.string().nullable(),
        status: productStatus,
        price: money,
        variants: z.array(variantView),
        createdAt: timestamp,
        updatedAt: timestamp,
    })
    .describe("Product");
export type ProductView = z.infer<typeof productView>;

export const createProductBody = z.strictObject({
    name: text(200),
    price,
    description: text(5000, 0).optional(),
    slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase words joined by -")
        .max(200)
        .optional(),
    status: productStatus.optional(),
    /** The storefront that sells it; left out, the business's only one. */
    storefrontId: id.optional(),
});
export type CreateProductBody = z.infer<typeof createProductBody>;

export const patchProductBody = z
    .strictObject({
        name: text(200).optional(),
        price: price.optional(),
        description: text(5000, 0).nullable().optional(),
        status: productStatus.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, "Send at least one field");
export type PatchProductBody = z.infer<typeof patchProductBody>;

export const createVariantBody = z.strictObject({
    sku: text(64),
    title: text(100),
    /** Left out or null: the product's price. */
    price: price.nullable().optional(),
});
export type CreateVariantBody = z.infer<typeof createVariantBody>;

export const patchVariantBody = z
    .strictObject({
        sku: text(64).optional(),
        title: text(100).optional(),
        price: price.nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, "Send at least one field");
export type PatchVariantBody = z.infer<typeof patchVariantBody>;

const count = z.number().int().min(0).max(1_000_000_000);

export const stockView = z
    .object({
        productId: id,
        tracked: z.boolean(),
        mode: z.enum(["product", "variant"]),
        quantity: z.number().int(),
        reserved: z.number().int(),
        lowStockAlert: z.number().int(),
        variants: z.array(
            z.object({
                variantId: id,
                quantity: z.number().int(),
                reserved: z.number().int(),
                lowStockAlert: z.number().int(),
            }),
        ),
    })
    .describe("Stock");
export type StockView = z.infer<typeof stockView>;

/** A product counted as a whole, or each variant's count. */
export const setStockBody = z.union([
    z.strictObject({ quantity: count, lowStockAlert: count.optional() }),
    z.strictObject({
        variants: z
            .array(
                z.strictObject({
                    variantId: id,
                    quantity: count,
                    lowStockAlert: count,
                }),
            )
            .min(1)
            .max(200),
    }),
]);
export type SetStockBody = z.infer<typeof setStockBody>;

export const serviceView = z
    .object({
        id,
        name: z.string(),
        description: z.string().nullable(),
        durationMinutes: z.number().int(),
        bufferBeforeMinutes: z.number().int(),
        bufferAfterMinutes: z.number().int(),
        capacity: z.number().int(),
        price: money.nullable(),
        /** The IANA time zone its hours are in. */
        timezone: z.string(),
        status: openEnum(SERVICE_STATUSES, "Whether it can be booked"),
        createdAt: timestamp,
        updatedAt: timestamp,
    })
    .describe("Service");
export type ServiceView = z.infer<typeof serviceView>;

const minutes = z.number().int().min(0).max(1440);

/** A service's price is a 32-bit column (`Service.priceCents`); a product's
 * fits the shared bound (`Decimal(10, 2)`). */
const servicePrice = price.extend({
    amountMinor: z.number().int().min(0).max(2_147_483_647),
});

export const createServiceBody = z.strictObject({
    name: text(128),
    description: text(2000, 0).optional(),
    durationMinutes: z.number().int().min(1).max(1440),
    bufferBeforeMinutes: minutes.optional(),
    bufferAfterMinutes: minutes.optional(),
    capacity: z.number().int().min(1).max(10_000).optional(),
    price: servicePrice.optional(),
    /** IANA time zone its hours are in; left out, the business's own. */
    timezone: z.string().min(1).max(64).optional(),
});
export type CreateServiceBody = z.infer<typeof createServiceBody>;

export const patchServiceBody = createServiceBody
    .partial()
    .extend({ description: text(2000, 0).nullable().optional() })
    .refine((b) => Object.keys(b).length > 0, "Send at least one field");
export type PatchServiceBody = z.infer<typeof patchServiceBody>;

export const hoursWindow = z
    .strictObject({
        /** 0 is Sunday. */
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: minutes,
        endMinute: minutes,
    })
    .refine((w) => w.endMinute > w.startMinute, "End after the start");

export const hoursView = z
    .object({ windows: z.array(hoursWindow) })
    .describe("Hours");
export type HoursView = z.infer<typeof hoursView>;

export const setHoursBody = z.strictObject({
    windows: z.array(hoursWindow).max(100),
});
export type SetHoursBody = z.infer<typeof setHoursBody>;

export const postView = z
    .object({
        id,
        siteId: id,
        title: z.string(),
        slug: z.string(),
        excerpt: z.string().nullable(),
        status: openEnum(POST_STATUSES, "Whether it is live"),
        publishedAt: timestamp.nullable(),
        createdAt: timestamp,
        updatedAt: timestamp,
    })
    .describe("Post");
export type PostView = z.infer<typeof postView>;

export const subscriptionPlanView = z
    .object({
        id,
        name: z.string(),
        description: z.string().nullable(),
        price: money,
        interval: planInterval,
        status: openEnum(PLAN_STATUSES, "Whether it takes new members"),
        classesPerMonth: z.number().int().nullable(),
        createdAt: timestamp,
    })
    .describe("SubscriptionPlan");
export type SubscriptionPlanView = z.infer<typeof subscriptionPlanView>;

const productParams = idParam("productId");
const variantParams = z.strictObject({ productId: id, variantId: id });
const serviceParams = idParam("serviceId");

export const v1ListProducts = defineRoute({
    method: "get",
    path: "/products",
    surface: "v1",
    tag: "Catalogue",
    summary: "List products",
    request: { query: pageQuery },
    responses: { 200: page(productView) },
    capability: "store:read",
});

export const v1CreateProduct = defineRoute({
    method: "post",
    path: "/products",
    surface: "v1",
    tag: "Catalogue",
    summary: "Create a product",
    request: { body: createProductBody },
    responses: { 201: productView },
    capability: "store:write",
});

export const v1GetProduct = defineRoute({
    method: "get",
    path: "/products/:productId",
    surface: "v1",
    tag: "Catalogue",
    summary: "Get a product",
    request: { params: productParams },
    responses: { 200: productView },
    capability: "store:read",
});

export const v1PatchProduct = defineRoute({
    method: "patch",
    path: "/products/:productId",
    surface: "v1",
    tag: "Catalogue",
    summary: "Change a product",
    request: { params: productParams, body: patchProductBody },
    responses: { 200: productView },
    capability: "store:write",
});

export const v1CreateVariant = defineRoute({
    method: "post",
    path: "/products/:productId/variants",
    surface: "v1",
    tag: "Catalogue",
    summary: "Add a variant",
    request: { params: productParams, body: createVariantBody },
    responses: { 201: productView },
    capability: "store:write",
});

export const v1PatchVariant = defineRoute({
    method: "patch",
    path: "/products/:productId/variants/:variantId",
    surface: "v1",
    tag: "Catalogue",
    summary: "Change a variant",
    request: { params: variantParams, body: patchVariantBody },
    responses: { 200: productView },
    capability: "store:write",
});

export const v1GetStock = defineRoute({
    method: "get",
    path: "/products/:productId/stock",
    surface: "v1",
    tag: "Catalogue",
    summary: "Get a product's stock",
    request: { params: productParams },
    responses: { 200: stockView },
    capability: "store:read",
});

export const v1SetStock = defineRoute({
    method: "patch",
    path: "/products/:productId/stock",
    surface: "v1",
    tag: "Catalogue",
    summary: "Count a product's stock",
    request: { params: productParams, body: setStockBody },
    responses: { 200: stockView },
    capability: "inventory:write",
});

export const v1ListServices = defineRoute({
    method: "get",
    path: "/services",
    surface: "v1",
    tag: "Catalogue",
    summary: "List services",
    request: { query: pageQuery },
    responses: { 200: page(serviceView) },
    capability: "service:read",
});

export const v1CreateService = defineRoute({
    method: "post",
    path: "/services",
    surface: "v1",
    tag: "Catalogue",
    summary: "Create a service",
    request: { body: createServiceBody },
    responses: { 201: serviceView },
    capability: "service:write",
});

export const v1GetService = defineRoute({
    method: "get",
    path: "/services/:serviceId",
    surface: "v1",
    tag: "Catalogue",
    summary: "Get a service",
    request: { params: serviceParams },
    responses: { 200: serviceView },
    capability: "service:read",
});

export const v1PatchService = defineRoute({
    method: "patch",
    path: "/services/:serviceId",
    surface: "v1",
    tag: "Catalogue",
    summary: "Change a service",
    request: { params: serviceParams, body: patchServiceBody },
    responses: { 200: serviceView },
    capability: "service:write",
});

export const v1GetHours = defineRoute({
    method: "get",
    path: "/services/:serviceId/hours",
    surface: "v1",
    tag: "Catalogue",
    summary: "Get when a service can be booked",
    request: { params: serviceParams },
    responses: { 200: hoursView },
    capability: "service:read",
});

export const v1SetHours = defineRoute({
    method: "put",
    path: "/services/:serviceId/hours",
    surface: "v1",
    tag: "Catalogue",
    summary: "Replace when a service can be booked",
    request: { params: serviceParams, body: setHoursBody },
    responses: { 200: hoursView },
    capability: "service:write",
});

export const v1ListPosts = defineRoute({
    method: "get",
    path: "/posts",
    surface: "v1",
    tag: "Content",
    summary: "List posts",
    request: { query: pageQuery },
    responses: { 200: page(postView) },
    capability: "site:read",
});

export const v1ListSubscriptionPlans = defineRoute({
    method: "get",
    path: "/subscription-plans",
    surface: "v1",
    tag: "Catalogue",
    summary: "List subscription plans",
    request: { query: pageQuery },
    responses: { 200: page(subscriptionPlanView) },
    capability: "subscription:read",
});
