import { z } from "zod";

import { id, money, openEnum, page, pageQuery } from "./common";
import { defineRoute } from "./openapi";
import { planInterval } from "./v1/catalogue";

/**
 * The storefront surface (plan 2026-11-10-001, U7), served under
 * `/v1/storefront`: reads with a publishable key in the path, and a
 * visitor's writes under `/write` with a storefront token a secret key
 * minted (`POST /v1/storefront-tokens`, on the secret surface). The
 * business comes from the key or the token; no route names a site or a
 * business.
 *
 * Every answer is an explicit list of fields, mapped one by one from what
 * the business's own Saroh site reads, so nothing else is published by
 * accident. Money, ids and names are /v1's; lists are /v1's page.
 */

export const PUBLISHABLE_KEY_PATTERN = /^pk_(?:live|test)_[0-9A-Za-z]{43}$/;
export const STOREFRONT_TOKEN_PATTERN = /^st_(?:live|test)_[0-9A-Za-z]{43}$/;

/** How a storefront order is paid: online now, or at handover. */
export const PAY_BY = ["online", "on_handover"] as const;
/** How much a hold is paid online: the whole price, or the deposit. */
export const HOLD_PAY = ["now", "deposit"] as const;
/** Where a visitor's booking stands. */
export const BOOKING_STATES = [
    "held",
    "confirmed",
    "released",
    "cancelled",
] as const;
/** The business's own payment provider, whose checkout takes `clientParams`. */
export const PAYMENT_PROVIDERS = [
    "stripe",
    "razorpay",
    "cashfree",
    "dodo",
] as const;
/** The ways a storefront order can leave (a subset of /v1's `fulfilment`). */
export const STOREFRONT_FULFILMENTS = [
    "pickup",
    "local_delivery",
    "shipping",
] as const;

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

const image = z.object({ url: z.string(), alt: z.string() });

const productCard = z.object({
    id,
    slug: z.string(),
    name: z.string(),
    price: money.describe("The lowest price it is offered at"),
    priceFrom: z
        .boolean()
        .describe("True when its options sell at different prices"),
    image: image.nullable(),
    soldOut: z.boolean(),
    hostedUrl,
});

export const storefrontProducts = page(productCard)
    .extend({ storefront: z.object({ name: z.string() }) })
    .describe("Products");

export const storefrontProduct = z
    .object({
        id,
        slug: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        price: money,
        images: z.array(
            image.extend({
                kind: openEnum(["photo", "video"], "What it is"),
            }),
        ),
        variants: z.array(
            z.object({
                id,
                title: z.string(),
                price: money.nullable().describe("Null: the product's price"),
                soldOut: z.boolean(),
            }),
        ),
        hostedUrl,
    })
    .describe("Product");

export const storefrontStock = page(
    z.object({
        productId: id,
        variantId: id
            .nullable()
            .describe("The option Add to bag adds; null without options"),
        left: z
            .number()
            .int()
            .nullable()
            .describe("How many are left, when only a few are; else null"),
        soldOut: z.boolean(),
    }),
).describe("Stock");

export const storefrontServices = page(
    z.object({
        id,
        name: z.string(),
        description: z.string().nullable(),
        durationMinutes: z.number().int(),
        price: money.nullable(),
        hostedUrl,
    }),
).describe("Services");

const serviceParams = keyParams.extend({ serviceId: id });

export const availabilityQuery = pageQuery.extend({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    staffId: id.optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuery>;

export const storefrontSlots = page(
    z.object({
        startAt: z.string(),
        endAt: z.string(),
        /** Who is free then; empty for a service with no people of its own. */
        staffIds: z.array(id),
        /** A class's places still open; null for a one-to-one. */
        placesLeft: z.number().int().nullable(),
    }),
).describe("Open slots");

export const daysQuery = z.strictObject({
    skip: z.coerce.number().int().min(0).max(70).optional(),
    staffId: id.optional(),
});
export type DaysQuery = z.infer<typeof daysQuery>;

export const storefrontDays = z
    .object({
        timezone: z.string(),
        kind: openEnum(["one", "class"], "One-to-one, or a class"),
        capacity: z.number().int(),
        days: z.array(
            z.object({
                /** YYYY-MM-DD in the business's time zone. */
                date: z.string(),
                open: z.boolean(),
                /** The business itself is closed that day. */
                closed: z.boolean(),
                starts: z.array(
                    z.object({
                        startAt: z.string(),
                        endAt: z.string(),
                        staffId: id.nullable(),
                        placesLeft: z.number().int().nullable(),
                    }),
                ),
            }),
        ),
        staff: z.array(z.object({ id, name: z.string() })),
    })
    .describe("Days");

export const storefrontStaff = page(
    z.object({ id, name: z.string() }),
).describe("Staff");

const postCard = z.object({
    slug: z.string(),
    title: z.string(),
    excerpt: z.string().nullable(),
    /** The cover photo's address, or null. */
    image: z.string().nullable(),
    category: z.object({ name: z.string(), slug: z.string() }).nullable(),
    author: z.string().nullable(),
    publishedAt: z.string(),
    hostedUrl,
});

export const storefrontPosts = page(postCard).describe("Posts");

export const storefrontPost = postCard
    .extend({ content: z.string().describe("The post, as sanitised HTML") })
    .describe("Post");

export const storefrontPlans = page(
    z.object({
        id,
        name: z.string(),
        description: z.string().nullable(),
        price: money,
        interval: planInterval,
        hostedUrl,
    }),
)
    .extend({
        payOnline: z
            .boolean()
            .describe("Whether someone signed in can join and pay online now"),
    })
    .describe("Plans");

// — Writes, with a storefront token ————————————————————————————————

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
});
export type BookBody = z.infer<typeof bookBody>;

export const holdBody = bookBody.extend({
    /** The whole price now, or the service's deposit. */
    pay: z.enum(HOLD_PAY).default("now"),
});
export type HoldBody = z.infer<typeof holdBody>;

export const holdTokenBody = z.strictObject({
    holdToken: z.string().min(16).max(128),
});
export type HoldTokenBody = z.infer<typeof holdTokenBody>;

export const storefrontBooking = z
    .object({
        id,
        serviceName: z.string(),
        startAt: z.string(),
        endAt: z.string(),
        state: openEnum(BOOKING_STATES, "Where the booking stands"),
        holdExpiresAt: z.string().nullable(),
        holdToken: z
            .string()
            .nullable()
            .describe(
                "A held booking's token: release it or start its payment with it. Given once.",
            ),
    })
    .describe("Booking");
export type StorefrontBookingView = z.infer<typeof storefrontBooking>;

/** The provider's checkout data, as its own page or widget takes it. */
export const storefrontPayment = z
    .object({
        id,
        provider: openEnum(
            PAYMENT_PROVIDERS,
            "The business's payment provider",
        ),
        amount: money,
        publicKey: z
            .string()
            .nullable()
            .describe(
                "The provider's public key for its checkout, if it takes one",
            ),
        clientParams: z
            .record(z.string(), z.unknown())
            .describe("What the provider's own checkout takes, as it names it"),
    })
    .describe("Payment");
export type StorefrontPaymentView = z.infer<typeof storefrontPayment>;

const bagLine = z.strictObject({
    productId: id,
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
    fulfilment: z.enum(STOREFRONT_FULFILMENTS),
    payment: z.enum(PAY_BY).default("online"),
    address: address.optional(),
    notes: z.string().max(500).nullable().optional(),
    discountCode: z.string().trim().max(32).nullable().optional(),
    /** Where the provider sends the customer back to, on the business's site. */
    returnPath: z.string().max(2048).optional(),
});
export type OrderBody = z.infer<typeof orderBody>;

export const storefrontOrder = z
    .object({
        id,
        /** The storefront's own number, like ORD-001. */
        number: z.string(),
        total: money,
        payBy: openEnum(PAY_BY, "How it is paid"),
        payment: storefrontPayment.nullable(),
    })
    .describe("Order");
export type StorefrontOrderView = z.infer<typeof storefrontOrder>;

export const formSubmitBody = z.strictObject({
    data: z.record(z.string(), z.unknown()),
});
export type FormSubmitBody = z.infer<typeof formSubmitBody>;

export const storefrontSubmission = z
    .object({ id })
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
        request: { params: keyParams, query: pageQuery },
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
        request: { params: keyParams, query: pageQuery },
        responses: { 200: storefrontStock },
        capability: "store:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/services",
        surface: "storefront",
        tag: READ,
        summary: "List the services that can be booked",
        request: { params: keyParams, query: pageQuery },
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
        request: { params: serviceParams, query: pageQuery },
        responses: { 200: storefrontStaff },
        capability: "service:read",
    }),
    defineRoute({
        method: "get",
        path: "/:key/posts",
        surface: "storefront",
        tag: READ,
        summary: "The site's published posts, newest first",
        request: { params: keyParams, query: pageQuery },
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
        request: { params: keyParams, query: pageQuery },
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
        responses: { 200: storefrontBooking },
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
        // A replay would keep the token, which is given once.
        idempotent: false,
    }),
] as const;
