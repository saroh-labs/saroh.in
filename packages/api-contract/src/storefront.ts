import { z } from "zod";

import { id } from "./common";
import { defineRoute } from "./openapi";

/**
 * The storefront surface (plan 2026-11-10-001, U7), served under
 * `/v1/storefront`: reads with a publishable key in the path, and a
 * visitor's writes under `/write` with a storefront token a secret key
 * minted (`POST /v1/storefront-tokens`, on the secret surface). The
 * business comes from the key or the token; no route names a site or a
 * business.
 *
 * Answers are the same objects the business's own Saroh site reads, so
 * each item schema names the fields a client can rely on and lets the
 * rest through.
 */

export const PUBLISHABLE_KEY_PATTERN = /^pk_(?:live|test)_[0-9A-Za-z]{43}$/;
export const STOREFRONT_TOKEN_PATTERN = /^st_(?:live|test)_[0-9A-Za-z]{43}$/;

const keyParams = z.object({
    key: z
        .string()
        .regex(PUBLISHABLE_KEY_PATTERN, "Not a publishable key")
        .describe("The publishable key, pk_live_…"),
});

/**
 * The page Saroh hosts for the item on the business's site: its connected
 * domain when it has one, else its saroh.app address. Null when the
 * business has no published site.
 */
const hostedUrl = z
    .string()
    .nullable()
    .describe(
        "Saroh's page for it on the business's site (its own domain, else saroh.app); null without a published site",
    );

const productCard = z.looseObject({
    slug: z.string(),
    name: z.string(),
    hostedUrl,
});

export const storefrontProducts = z
    .looseObject({
        storefront: z.object({ name: z.string() }),
        products: z.array(productCard),
    })
    .describe("Products");

export const storefrontProduct = z
    .looseObject({
        productId: id,
        slug: z.string(),
        listingId: id,
        name: z.string(),
        currency: z.string(),
        price: z.string().describe("A decimal string, e.g. 1200.00"),
        hostedUrl,
    })
    .describe("Product");

export const storefrontStock = z
    .object({
        items: z.array(
            z.looseObject({
                slug: z.string(),
                listingId: id,
                variantId: id.nullable(),
                left: z.number().int().nullable(),
                soldOut: z.boolean(),
            }),
        ),
    })
    .describe("Stock");

const service = z.looseObject({
    id,
    name: z.string(),
    durationMinutes: z.number().int(),
    priceCents: z.number().int().nullable(),
    currency: z.string().nullable(),
    hostedUrl,
});

export const storefrontServices = z
    .object({ data: z.array(service) })
    .describe("Services");

const serviceParams = keyParams.extend({ serviceId: id });

export const availabilityQuery = z.strictObject({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    staffId: id.optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuery>;

export const storefrontSlots = z
    .object({
        data: z.array(
            z.looseObject({
                startAt: z.string(),
                endAt: z.string(),
                staffIds: z.array(id).optional(),
                placesLeft: z.number().int().optional(),
            }),
        ),
    })
    .describe("Open slots");

export const daysQuery = z.strictObject({
    skip: z.coerce.number().int().min(0).max(70).optional(),
    staffId: id.optional(),
});
export type DaysQuery = z.infer<typeof daysQuery>;

export const storefrontDays = z
    .looseObject({
        timezone: z.string(),
        kind: z.enum(["one", "class"]),
        capacity: z.number().int(),
        days: z.array(z.looseObject({})),
        staff: z.array(z.object({ id, name: z.string() })),
    })
    .describe("Days");

export const storefrontStaff = z
    .object({ data: z.array(z.object({ id, name: z.string() })) })
    .describe("Staff");

export const storefrontPosts = z
    .object({ posts: z.array(z.unknown()) })
    .describe("Posts");

export const storefrontPost = z
    .looseObject({ snapshot: z.unknown(), publishedAt: z.unknown() })
    .describe("Post");

export const storefrontPlans = z
    .looseObject({
        plans: z.array(
            z.looseObject({
                id,
                name: z.string(),
                price: z.string(),
                currency: z.string(),
                interval: z.string(),
                hostedUrl,
            }),
        ),
        payOnline: z.boolean(),
    })
    .describe("Plans");

// — Writes, with a storefront token ————————————————————————————————

const idempotencyKey = z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, "8 to 64 letters, digits, - or _");

const booker = {
    name: z.string().trim().min(1).max(120),
    email: z
        .email()
        .max(254)
        .optional()
        .describe(
            "The visitor's email. The token must have been minted with one (`visitor.email`); this must match it, any case, or be left out to use it.",
        ),
    phone: z.string().trim().max(32).optional(),
};

export const bookBody = z.strictObject({
    serviceId: id,
    startAt: z.iso.datetime({ offset: true }),
    ...booker,
    staffId: id.optional(),
    idempotencyKey: idempotencyKey.optional(),
});
export type BookBody = z.infer<typeof bookBody>;

export const holdBody = bookBody.extend({
    /** The whole price now, or the service's deposit. */
    pay: z.enum(["NOW", "DEPOSIT"]).default("NOW"),
});
export type HoldBody = z.infer<typeof holdBody>;

export const holdTokenBody = z.strictObject({
    holdToken: z.string().min(16).max(128),
});
export type HoldTokenBody = z.infer<typeof holdTokenBody>;

export const storefrontBooking = z
    .looseObject({
        reference: z.string(),
        startAt: z.string(),
        endAt: z.string(),
        serviceName: z.string(),
        state: z.string(),
        holdExpiresAt: z.string().nullable(),
        holdToken: z
            .string()
            .nullable()
            .describe(
                "A held booking's token: release it or start its payment with it. Given once.",
            ),
    })
    .describe("Booking");

export const storefrontHold = z
    .looseObject({
        state: z.string(),
        holdExpiresAt: z.string().nullable(),
        booking: z.looseObject({ reference: z.string() }),
    })
    .describe("Hold");

/** The provider's checkout data, as its own page or widget takes it. */
export const storefrontPayment = z
    .looseObject({ provider: z.string().optional() })
    .describe("Payment");

const bagLine = z.strictObject({
    listingId: id,
    variantId: id.nullable().optional(),
    quantity: z.number().int().min(1).max(99),
});

const address = z.strictObject({
    name: z.string().trim().max(120).nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(100).nullable().optional(),
    postalCode: z.string().trim().max(16).nullable().optional(),
    country: z.string().trim().max(2).nullable().optional(),
});

export const orderBody = z.strictObject({
    ...booker,
    lines: z.array(bagLine).min(1).max(30),
    fulfilment: z.enum(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]),
    payment: z.enum(["ONLINE", "ON_HANDOVER"]).default("ONLINE"),
    address: address.optional(),
    notes: z.string().max(500).nullable().optional(),
    discountCode: z.string().trim().max(32).nullable().optional(),
    /** One order per key: the same key again answers the same order. */
    idempotencyKey,
    /** Where the provider sends the customer back to, on the business's site. */
    returnPath: z.string().max(2048).optional(),
});
export type OrderBody = z.infer<typeof orderBody>;

export const storefrontOrder = z
    .looseObject({
        orderId: id,
        orderNumber: z.string(),
        total: z.string(),
        currency: z.string(),
        payBy: z.enum(["ONLINE", "ON_HANDOVER"]),
        payment: storefrontPayment.nullable(),
    })
    .describe("Order");

export const formSubmitBody = z.strictObject({
    data: z.record(z.string(), z.unknown()),
    idempotencyKey: idempotencyKey.optional(),
});
export type FormSubmitBody = z.infer<typeof formSubmitBody>;

export const storefrontSubmission = z
    .looseObject({})
    .describe("Form submission");

// — Minting, with a secret key ———————————————————————————————————

export const mintStorefrontTokenBody = z.strictObject({
    /** The publishable key whose allowed origins the token copies. */
    publishableKeyId: id,
    /**
     * The visitor your server knows, by email. Orders and bookings made
     * with the token are made under this email and no other; without it,
     * the token can only send enquiries.
     */
    visitor: z.strictObject({ email: z.email().max(254) }).optional(),
});
export type MintStorefrontTokenBody = z.infer<typeof mintStorefrontTokenBody>;

export const storefrontToken = z
    .object({
        token: z.string().describe("st_live_…, given once"),
        expiresAt: z.string(),
        allowedOrigins: z.array(z.string()),
    })
    .describe("Storefront token");
export type StorefrontTokenView = z.infer<typeof storefrontToken>;

// — Routes ———————————————————————————————————————————————————————

const READ = "Storefront";
const WRITE = "Storefront writes";

export const STOREFRONT_ROUTES = [
    defineRoute({
        method: "get",
        path: "/:key/products",
        surface: "storefront",
        tag: READ,
        summary: "List the products the business's shop sells",
        request: { params: keyParams },
        responses: { 200: storefrontProducts },
        capability: "store:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/products/:slug",
        surface: "storefront",
        tag: READ,
        summary: "Get one product by its address",
        request: { params: keyParams.extend({ slug: z.string().max(200) }) },
        responses: { 200: storefrontProduct },
        capability: "store:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/stock",
        surface: "storefront",
        tag: READ,
        summary: "How many of each product are left",
        request: { params: keyParams },
        responses: { 200: storefrontStock },
        capability: "store:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/services",
        surface: "storefront",
        tag: READ,
        summary: "List the services that can be booked",
        request: { params: keyParams },
        responses: { 200: storefrontServices },
        capability: "service:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/services/:serviceId/availability",
        surface: "storefront",
        tag: READ,
        summary: "Open slots for a service between two instants",
        request: { params: serviceParams, query: availabilityQuery },
        responses: { 200: storefrontSlots },
        capability: "service:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/services/:serviceId/days",
        surface: "storefront",
        tag: READ,
        summary: "A service's next two weeks, day by day",
        request: { params: serviceParams, query: daysQuery },
        responses: { 200: storefrontDays },
        capability: "service:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/services/:serviceId/staff",
        surface: "storefront",
        tag: READ,
        summary: "Who takes a service, by name",
        request: { params: serviceParams },
        responses: { 200: storefrontStaff },
        capability: "service:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/posts",
        surface: "storefront",
        tag: READ,
        summary: "The site's published posts, newest first",
        request: { params: keyParams },
        responses: { 200: storefrontPosts },
        capability: "site:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/posts/:slug",
        surface: "storefront",
        tag: READ,
        summary: "One published post",
        request: { params: keyParams.extend({ slug: z.string().max(200) }) },
        responses: { 200: storefrontPost },
        capability: "site:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/plans",
        surface: "storefront",
        tag: READ,
        summary: "The membership plans on sale",
        request: { params: keyParams },
        responses: { 200: storefrontPlans },
        capability: "subscription:read",
    }),
    defineRoute({
        method: "post",
        path: "/write/bookings",
        surface: "storefront",
        tag: WRITE,
        summary: "Book a slot, to pay at the desk or for nothing",
        request: { body: bookBody },
        responses: { 201: storefrontBooking },
        capability: "storefront:mint",
    }),
    defineRoute({
        method: "post",
        path: "/write/holds",
        surface: "storefront",
        tag: WRITE,
        summary: "Hold a slot while the customer pays online",
        request: { body: holdBody },
        responses: { 201: storefrontBooking },
        capability: "storefront:mint",
    }),
    defineRoute({
        method: "post",
        path: "/write/holds/release",
        surface: "storefront",
        tag: WRITE,
        summary: "Let a hold go before its time",
        request: { body: holdTokenBody },
        responses: { 200: storefrontHold },
        capability: "storefront:mint",
    }),
    defineRoute({
        method: "post",
        path: "/write/payments",
        surface: "storefront",
        tag: WRITE,
        summary:
            "Start paying for a hold: the business's own provider's checkout data",
        request: { body: holdTokenBody },
        responses: { 201: storefrontPayment },
        capability: "storefront:mint",
    }),
    defineRoute({
        method: "post",
        path: "/write/orders",
        surface: "storefront",
        tag: WRITE,
        summary: "Place an order, with its payment when paid online",
        request: { body: orderBody },
        responses: { 201: storefrontOrder },
        capability: "storefront:mint",
    }),
    defineRoute({
        method: "post",
        path: "/write/forms/:formId/submissions",
        surface: "storefront",
        tag: WRITE,
        summary: "Send an enquiry through one of the business's forms",
        request: {
            params: z.object({ formId: id }),
            body: formSubmitBody,
        },
        responses: { 201: storefrontSubmission },
        capability: "storefront:mint",
    }),
    defineRoute({
        method: "post",
        path: "/storefront-tokens",
        surface: "v1",
        tag: "Storefront tokens",
        summary: "Mint a short-lived token for one visitor's storefront writes",
        request: { body: mintStorefrontTokenBody },
        responses: { 201: storefrontToken },
        capability: "storefront:mint",
    }),
] as const;
