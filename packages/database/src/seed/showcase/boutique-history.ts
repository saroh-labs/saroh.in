import type { Prisma } from "@prisma/client";

import { at, id } from "../helpers";
import type { BoutiqueProduct } from "./boutique-catalog";
import { BOUTIQUE_PRODUCTS } from "./boutique-catalog";
import { CITIES, SHOWCASE_KEY, SHOWCASE_SEED } from "./data";
import { hashKey, istAt, makePeople, phoneNumber } from "./people";
import type { Rng } from "./random";
import { createRng } from "./random";
import { seasonAt } from "./traffic";

/**
 * Leela & Loom's three months of trade (the owner's "about 150 orders a
 * month, about 100 paying customers"): orders placed online and in the shop
 * on Commercial Street, most delivered by courier, a few collected, some
 * cancelled and refunded, first-order and sale codes redeemed. Planned from a
 * seeded stream and dates relative to now; `boutique.ts` writes the rows.
 *
 * Every one is closed — delivered, collected, with the courier, or
 * cancelled — and at least two days old: today's and yesterday's open
 * orders are the eight the boutique already holds stock for, so the
 * designed sold-out and low states stay as they are.
 */

const KEY = "ll";
const sid = (...parts: (string | number)[]) => id(SHOWCASE_KEY, KEY, ...parts);
const rngFor = (...parts: string[]) =>
    createRng((SHOWCASE_SEED ^ hashKey(KEY, ...parts)) >>> 0);

/** Days of history: three months back, up to the day before yesterday. */
const FROM_DAY = -90;
const TO_DAY = -2;
/** Orders on an ordinary weekday, before the season. */
const PER_DAY = 3.9;
/** New customers on top of the reviewers and open-order buyers. */
const NEW_CUSTOMERS = 36;

/** Free delivery from ₹1,499; ₹79 below (the journal's Help says so). */
const FREE_FROM_PAISE = 149_900;
const DELIVERY_PAISE = 7_900;

const STREETS = [
    "Flat 304, Prestige Shantiniketan, Whitefield Main Road",
    "12, 4th Cross, Indiranagar 2nd Stage",
    "Flat B-702, Sobha Dream Acres, Panathur Road",
    "45, 7th Main, Jayanagar 4th Block",
    "House 9, 2nd Main, Koramangala 6th Block",
    "Flat 11, Lake View Apartments, HSR Layout Sector 2",
    "221, 1st Floor, 80 Feet Road, RT Nagar",
    "Flat 503, Brigade Gateway, Malleshwaram West",
    "18, Sai Krupa, 3rd Cross, Basavanagudi",
    "Flat 2A, Green Glen Layout, Bellandur",
    "B-14, Ocean Park, Andheri East",
    "Flat 601, Lodha Splendora, Thane West",
    "22, Gandhi Nagar, Adyar",
    "Plot 41, Jubilee Hills Road No. 36",
    "Flat 9, Kalyani Nagar, near Joggers Park",
    "House 7, Panampilly Nagar",
    "C-1102, Mahagun Moderne, Sector 78",
    "18, Race Course Road, R.S. Puram",
];

const NOTES = [
    "Gift wrap please — it's for my sister's birthday.",
    "Please call before delivery, the gate is locked after 9pm.",
    "Leave with the security desk if I'm not in.",
    "Is the colour exactly like the photo? Happy to wait for a call.",
    "Deliver after 6pm on weekdays, please.",
    "Collecting from the shop on Saturday.",
    "No invoice in the box, it's a gift.",
];

const COURIERS = [
    { name: "Delhivery", track: "https://track.example.in/delivery/" },
    { name: "Blue Dart", track: "https://track.example.in/bluedart/" },
    { name: "DTDC", track: "https://track.example.in/dtdc/" },
] as const;

/** A product's id, variants by title and shelf rows, as `boutique.ts` placed it. */
export interface PlacedProduct {
    productId: string;
    variants: Record<string, string>;
    stockLevelId: string | null;
    variantStock: Record<string, string>;
}

/** A customer the shop already has, from the reviews and open orders. */
export interface KnownCustomer {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    city: string;
}

export interface Redemption {
    orderId: string;
    discountKey: "welcome100" | "monsoon20" | "glow15";
    amountPaise: number;
    createdAt: Date;
}

export interface BoutiqueHistory {
    customers: Prisma.CustomerCreateManyInput[];
    orders: Prisma.OrderCreateManyInput[];
    items: Prisma.OrderItemCreateManyInput[];
    redemptions: Redemption[];
}

const paise = (price: string) => {
    const [w = "0", f = ""] = price.split(".");
    return Number(w) * 100 + Number((f + "00").slice(0, 2));
};
export const rupeesOf = (p: number) =>
    `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;

/** How often each kind of product sells, relative to the others. */
const DEMAND: Record<string, number> = {
    dresses: 1.5,
    moisturisers: 1.3,
    serums: 1.2,
    cleansers: 1,
    mens: 0.8,
};

/** A delivery address in the customer's city. */
export function addressFor(
    rng: Rng,
    person: { first: string; last: string; phone?: string | null },
    city: { city: string; state: string; zip: string },
) {
    return {
        deliveryName: `${person.first} ${person.last}`,
        deliveryPhone: person.phone ?? phoneNumber(rng),
        deliveryLine1: rng.pick(STREETS),
        deliveryLine2: null,
        deliveryCity: city.city,
        deliveryState: city.state,
        deliveryPostalCode: city.zip,
    };
}

const cityNamed = (name: string) =>
    CITIES.find((c) => c.city === name) ??
    ({ city: name, state: "Karnataka", zip: "560001", weight: 1 } as const);

export function planBoutiqueHistory(a: {
    now: Date;
    storeId: string;
    orgId: string;
    placed: Record<string, PlacedProduct>;
    known: readonly KnownCustomer[];
}): BoutiqueHistory {
    const { now, storeId, orgId } = a;
    const rng = rngFor("history");
    const used = new Set(a.known.map((c) => c.email.toLowerCase()));
    const people = makePeople(
        rngFor("history", "people"),
        NEW_CUSTOMERS,
        used,
        {
            cities: true,
        },
    );

    // The pool: everyone the shop knows, then the new names. A few
    // regulars buy most often (skewed), as in any shop.
    const pool = [
        ...a.known.map((c) => ({
            id: c.id,
            first: c.firstName,
            last: c.lastName,
            email: c.email,
            phone: null as string | null,
            city: cityNamed(c.city),
            fresh: false,
        })),
        ...people.map((p, n) => ({
            id: sid("customer", "h", n),
            first: p.first,
            last: p.last,
            email: p.email,
            phone: p.phone,
            city: p.city ?? cityNamed("Bengaluru"),
            fresh: true,
        })),
    ];
    // Shuffle once so the regulars are a mix of both.
    for (let i = pool.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const products = BOUTIQUE_PRODUCTS.filter(
        (p) => p.status === "PUBLISHED" && p.slug in a.placed,
    );
    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const redemptions: Redemption[] = [];
    const firstOrder = new Map<string, Date>();
    const ordered = new Set<string>();
    let n = 0;

    for (let d = FROM_DAY; d <= TO_DAY; d++) {
        const noon = istAt(now, d, 12 * 60);
        const weekday = new Date(noon.getTime() + 330 * 60_000).getUTCDay();
        const weekend = weekday === 0 || weekday === 6 ? 1.25 : 1;
        // Tuesdays the shop is shut, so only the website takes orders.
        const tuesday = weekday === 2 ? 0.75 : 1;
        const mean = PER_DAY * weekend * tuesday * seasonAt("boutique", noon);
        const count = Math.max(
            0,
            Math.round(mean + (rng.next() + rng.next() - 1) * 2.2),
        );
        for (let k = 0; k < count; k++) {
            const who = pool[rng.skewed(pool.length, 1.7)];
            const placedAt = istAt(now, d, rng.int(8 * 60, 23 * 60));
            const orderId = sid("order", "h", n);

            // Lines: one thing mostly, sometimes a routine of two or three.
            const lineCount = rng.weighted([1, 2, 3], (x) =>
                x === 1 ? 6 : x === 2 ? 3 : 1,
            );
            const picked: BoutiqueProduct[] = [];
            while (picked.length < lineCount) {
                const p = rng.weighted(
                    products,
                    (x) => DEMAND[x.category] ?? 1,
                );
                if (!picked.includes(p)) picked.push(p);
            }
            let subtotal = 0;
            let serumTotal = 0;
            picked.forEach((p, line) => {
                const place = a.placed[p.slug];
                const v =
                    p.variants.length > 0 ? rng.pick(p.variants) : undefined;
                const price = v?.price ?? p.price;
                const qty =
                    p.category === "dresses" ? 1 : rng.chance(0.15) ? 2 : 1;
                subtotal += paise(price) * qty;
                if (p.category === "serums") serumTotal += paise(price) * qty;
                const variantId = v ? (place.variants[v.title] ?? null) : null;
                const stockLevelId = v
                    ? (place.variantStock[v.title] ?? null)
                    : place.stockLevelId;
                items.push({
                    id: sid("orderitem", "h", n, line),
                    orderId,
                    productId: place.productId,
                    variantId,
                    quantity: qty,
                    price,
                    stockRow: stockLevelId
                        ? variantId
                            ? "VARIANT"
                            : "PRODUCT"
                        : null,
                    stockLevelId,
                    heldQuantity: 0,
                });
            });

            // A code: a first order's ₹100, the monsoon sale's 20%, the
            // festive serums' 15% — each in its own window.
            let discount = 0;
            let code: Redemption["discountKey"] | null = null;
            const first = !ordered.has(who.id);
            if (d >= -45 && d <= -24 && rng.chance(0.45)) {
                discount = Math.round((subtotal * 0.2) / 100) * 100;
                code = "monsoon20";
            } else if (d >= -6 && serumTotal > 0 && rng.chance(0.6)) {
                discount = Math.round((serumTotal * 0.15) / 100) * 100;
                code = "glow15";
            } else if (first && who.fresh && rng.chance(0.35)) {
                discount = 10_000;
                code = "welcome100";
            }
            ordered.add(who.id);
            if (!firstOrder.has(who.id)) firstOrder.set(who.id, placedAt);

            const age = -d;
            // Most go by courier; Bengaluru people sometimes collect.
            const collects = who.city.city === "Bengaluru" && rng.chance(0.22);
            const net = subtotal - discount;
            const shipping =
                collects || net >= FREE_FROM_PAISE ? 0 : DELIVERY_PAISE;
            const roll = rng.next();
            const cancelled = roll < 0.025;
            const failed = !cancelled && roll < 0.035;
            const courier = rng.pick(COURIERS);
            const tracking = `${courier.name === "Delhivery" ? "DL" : courier.name === "Blue Dart" ? "BD" : "DT"}${rng.int(1e9, 9e9)}`;
            const withCourier = !collects && !cancelled && !failed && age < 5;
            const stage =
                cancelled || failed
                    ? "NEW"
                    : collects
                      ? "COLLECTED"
                      : withCourier
                        ? "HANDED_TO_COURIER"
                        : "DELIVERED";
            const status =
                cancelled || failed
                    ? "CANCELLED"
                    : withCourier
                      ? "SHIPPED"
                      : "DELIVERED";
            const paymentStatus = failed
                ? "FAILED"
                : cancelled
                  ? "REFUNDED"
                  : "PAID";
            const doneAt = at(
                now,
                d + (collects ? 1 : withCourier ? 0 : rng.int(2, 4)),
                17,
            );
            orders.push({
                id: orderId,
                storeId,
                organizationId: orgId,
                orderId: "",
                customerId: who.id,
                subtotal: rupeesOf(subtotal),
                shipping: rupeesOf(shipping),
                discount: rupeesOf(discount),
                total: rupeesOf(net + shipping),
                currency: "INR",
                status,
                paymentStatus,
                stage,
                fulfilment: collects ? "PICKUP" : "SHIPPING",
                ...(collects ? {} : addressFor(rng, who, who.city)),
                notes: rng.chance(0.08) ? rng.pick(NOTES) : null,
                placedOnline: !collects || rng.chance(0.5),
                paidAt: failed ? null : new Date(placedAt.getTime() + 60_000),
                courierName:
                    withCourier || stage === "DELIVERED" ? courier.name : null,
                trackingNumber:
                    withCourier || stage === "DELIVERED" ? tracking : null,
                trackingUrl:
                    withCourier || stage === "DELIVERED"
                        ? `${courier.track}${tracking}`
                        : null,
                createdAt: placedAt,
                updatedAt:
                    cancelled || failed
                        ? new Date(placedAt.getTime() + 3 * 3_600_000)
                        : doneAt > now
                          ? now
                          : doneAt,
            });
            if (code && !failed && !cancelled) {
                redemptions.push({
                    orderId,
                    discountKey: code,
                    amountPaise: discount,
                    createdAt: placedAt,
                });
            }
            n += 1;
        }
    }

    const customers: Prisma.CustomerCreateManyInput[] = pool
        .filter((p) => p.fresh && firstOrder.has(p.id))
        .map((p) => {
            const since = new Date(
                (firstOrder.get(p.id) ?? now).getTime() - 20 * 60_000,
            );
            return {
                id: p.id,
                storeId,
                organizationId: orgId,
                email: p.email,
                firstName: p.first,
                lastName: p.last,
                phone: p.phone,
                country: "India",
                state: p.city.state,
                city: p.city.city,
                zipCode: p.city.zip,
                createdAt: since,
                updatedAt: since,
            };
        });
    // A new name that never ordered is not a customer yet.
    return { customers, orders, items, redemptions };
}
