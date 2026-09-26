import { id } from "../helpers";
import { SHOWCASE_KEY } from "./data";

/**
 * Rye & Co.'s catalogue (U9, #526): what it sells, where, and how it counts
 * it — the designs' sample data (`saroh-fixtures.js`: products, variants,
 * storefronts, collections) laid over the bakery the invoices, orders and
 * subscriptions films already use. Data only; `bakery.ts` writes the
 * business and its orders, `bakery-stock.ts` its options, variants,
 * listings, shelves, stock log and collections.
 */

export const RYE_KEY = "rc";
/** A Rye & Co. row's seeded id: `seed_sc_rc_<parts>`. */
export const ryeId = (...parts: (string | number)[]) =>
    id(SHOWCASE_KEY, RYE_KEY, ...parts);

/** Hill Road, the shop that also delivers; Online, the website's shop. */
export type StoreKey = "H" | "O";

export const ALLERGENS = [
    "Gluten",
    "Milk",
    "Eggs",
    "Nuts",
    "Peanuts",
    "Sesame",
    "Soy",
    "Mustard",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const CATEGORIES = [
    { key: "breads", name: "Breads" },
    { key: "pastry", name: "Pastry" },
    { key: "coffee", name: "Coffee" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** Bread nil-rated (HSN 1905 90 10), pastry 18% (1905 90 20), coffee 5% (SAC 996331). */
export const RATES: Record<CategoryKey, { bps: number; code: string }> = {
    breads: { bps: 0, code: "19059010" },
    pastry: { bps: 1800, code: "19059020" },
    coffee: { bps: 500, code: "996331" },
};

/** The business's options; a product's variants pick one option's values. */
export const OPTIONS = [
    { key: "size", name: "Size", values: ["200g", "400g", "800g"] },
    {
        key: "grind",
        name: "Grind",
        values: ["Whole bean", "Espresso", "Filter"],
    },
    { key: "pack", name: "Pack", values: ["Single", "Six-pack", "Box of 4"] },
] as const;
export type OptionKey = (typeof OPTIONS)[number]["key"];

export interface BakeryVariant {
    sku: string;
    /** Its value of the product's option — also its title. */
    value: string;
    /** Whole rupees; absent: the product's price. */
    price?: number;
}

export interface BakeryProduct {
    slug: string;
    name: string;
    category: CategoryKey | null;
    /** GST-inclusive, whole rupees. */
    price: number;
    description: string;
    /** The designs' key points, as the product page lists them. */
    keyPoints?: readonly string[];
    /** Ingredients (the product's materials). */
    ingredients?: string;
    /** When it is ready: the line under the price (its how-to-use). */
    ready?: string;
    contains: readonly Allergen[];
    mayContain: readonly Allergen[];
    /** Default PUBLISHED. */
    status?: "DRAFT" | "PUBLISHED";
    /** The rate and code when not its category's. */
    gst?: { bps: number; code: string };
    /** Bought in rather than baked here. */
    maker?: string;
    /** Absent: non-returnable fresh food. Null: the storefront's rule. */
    returns?: string | null;
    /** Counts stock (#515). Off: baked fresh, it always sells. */
    tracked: boolean;
    option?: OptionKey;
    variants?: readonly BakeryVariant[];
    /** Where it is sold. Default Hill Road. */
    stores?: readonly StoreKey[];
    /** Variants a storefront sells, when not all of them. */
    variantsAt?: Partial<Record<StoreKey, readonly number[]>>;
}

export const PRODUCTS: readonly BakeryProduct[] = [
    {
        slug: "sourdough-loaf",
        name: "Sourdough loaf",
        category: "breads",
        price: 480,
        description:
            "A long-fermented loaf, milled and baked on Hill Road. Crust dark, crumb open, keeps three days in paper.",
        keyPoints: ["48-hour cold ferment", "Stoneground wheat, milled here"],
        ingredients: "Stoneground wheat flour, water, salt, sourdough starter.",
        ready: "Baked each morning. Collect from 7am at Hill Road, or delivered next day.",
        contains: ["Gluten"],
        mayContain: ["Nuts", "Sesame"],
        tracked: true,
        option: "size",
        variants: [
            { sku: "SD-800-L", value: "800g" },
            { sku: "SD-400-S", value: "400g", price: 260 },
        ],
        stores: ["H", "O"],
        // The small loaf is baked for the website's orders only.
        variantsAt: { H: [0] },
    },
    {
        slug: "rye-caraway-loaf",
        name: "Rye & caraway loaf",
        category: "breads",
        price: 540,
        description: "Dark rye with toasted caraway, dense and sour.",
        ready: "Baked each morning. Collect from 7am at Hill Road.",
        contains: ["Gluten"],
        mayContain: [],
        tracked: true,
    },
    {
        slug: "seeded-multigrain-loaf",
        name: "Seeded multigrain loaf",
        category: "breads",
        price: 420,
        description:
            "Sunflower, pumpkin, flax and sesame through a wholewheat crumb.",
        contains: ["Gluten", "Sesame"],
        mayContain: ["Nuts"],
        tracked: false,
    },
    {
        slug: "baguette",
        name: "Baguette",
        category: "breads",
        price: 160,
        description: "Baked three times a day; best within the hour.",
        contains: ["Gluten"],
        mayContain: ["Sesame"],
        tracked: false,
    },
    {
        slug: "butter-croissant",
        name: "Butter croissant",
        category: "pastry",
        price: 180,
        description: "Laminated over three days with cultured butter.",
        contains: ["Gluten", "Milk", "Eggs"],
        mayContain: [],
        tracked: false,
    },
    {
        slug: "pain-au-chocolat",
        name: "Pain au chocolat",
        category: "pastry",
        price: 220,
        description: "Two batons of dark chocolate in croissant dough.",
        contains: ["Gluten", "Milk", "Eggs", "Soy"],
        mayContain: ["Nuts"],
        tracked: false,
    },
    {
        slug: "cinnamon-bun",
        name: "Cinnamon bun",
        category: "pastry",
        price: 120,
        description: "Laminated dough, cinnamon sugar, a thin orange glaze.",
        ingredients:
            "Wheat flour, butter, milk, sugar, cinnamon, eggs, yeast, orange.",
        ready: "Baked each morning.",
        contains: ["Gluten", "Milk", "Eggs"],
        mayContain: ["Nuts"],
        tracked: true,
        option: "pack",
        variants: [
            { sku: "CB-120", value: "Single" },
            { sku: "CB-126", value: "Six-pack", price: 320 },
        ],
    },
    {
        slug: "almond-croissant",
        name: "Almond croissant",
        category: "pastry",
        price: 360,
        description: "Twice-baked with frangipane and flaked almonds.",
        ingredients: "Wheat flour, butter, almonds, sugar, eggs, milk.",
        ready: "Baked each morning.",
        contains: ["Gluten", "Milk", "Eggs", "Nuts"],
        mayContain: [],
        tracked: true,
        option: "pack",
        variants: [
            { sku: "AC-006", value: "Single" },
            { sku: "AC-024", value: "Box of 4", price: 1260 },
        ],
    },
    {
        slug: "flat-white",
        name: "Flat white",
        category: "coffee",
        price: 220,
        description: "A double ristretto and steamed milk.",
        contains: ["Milk"],
        mayContain: [],
        tracked: false,
    },
    {
        slug: "cappuccino",
        name: "Cappuccino",
        category: "coffee",
        price: 200,
        description: "House blend, from Kaapi Roasters in Chikmagalur.",
        contains: ["Milk"],
        mayContain: [],
        tracked: false,
    },
    {
        slug: "cold-brew",
        name: "Cold brew",
        category: "coffee",
        price: 250,
        description: "Steeped for eighteen hours; black, over ice.",
        contains: [],
        mayContain: [],
        tracked: false,
    },
    // --- the designs' products the bakery didn't sell yet (#526)
    {
        slug: "focaccia-rosemary",
        name: "Focaccia, rosemary",
        category: "breads",
        price: 600,
        description: "A full tray, olive oil and rosemary from the garden.",
        ingredients: "Wheat flour, water, olive oil, rosemary, salt, yeast.",
        ready: "Baked each morning. Collect from 7am at Hill Road.",
        contains: ["Gluten"],
        mayContain: [],
        tracked: true,
    },
    {
        slug: "house-blend-beans-250g",
        name: "House blend beans, 250g",
        category: "coffee",
        price: 950,
        description: "Roasted on Tuesdays, sent out within the week.",
        ingredients: "Arabica coffee beans.",
        contains: [],
        mayContain: [],
        gst: { bps: 500, code: "0901" },
        maker: "Kaapi Roasters, Chikmagalur",
        returns: "Returnable within 7 days, unused.",
        tracked: true,
        option: "grind",
        variants: [
            { sku: "HB-250-W", value: "Whole bean" },
            { sku: "HB-250-E", value: "Espresso" },
            { sku: "HB-250-F", value: "Filter" },
        ],
        stores: ["H", "O"],
    },
    {
        slug: "bakers-gift-box",
        name: "Baker's gift box",
        category: null,
        price: 3800,
        description: "A loaf, beans, a jar of jam and a tea towel.",
        contains: ["Gluten"],
        mayContain: ["Nuts"],
        gst: { bps: 1800, code: "19059020" },
        returns: null,
        // Made up to order: nothing to count.
        tracked: false,
        stores: ["O"],
    },
    {
        slug: "house-blend-beans-1kg",
        name: "House blend beans, 1kg",
        category: "coffee",
        price: 3100,
        description: "",
        ingredients: "Arabica coffee beans.",
        contains: [],
        mayContain: [],
        // Published, not the designs' draft: "Needs you" counts only what
        // is on sale, and this is the second of the two out of stock.
        gst: { bps: 500, code: "0901" },
        maker: "Kaapi Roasters, Chikmagalur",
        returns: "Returnable within 7 days, unused.",
        tracked: true,
        option: "grind",
        variants: [{ sku: "HB-100", value: "Whole bean" }],
        stores: ["O"],
    },
];

/** A product's index by slug. */
export const P = Object.fromEntries(
    PRODUCTS.map((p, i) => [p.slug, i]),
) as Record<string, number>;

/**
 * The bakery's first eleven products — the ones its five weeks of orders
 * are drawn from, so adding the designs' products moves no history.
 */
export const HISTORY_PRODUCTS = 11;

/** A product's GST rate and HSN/SAC code. */
export function rateOf(p: BakeryProduct): { bps: number; code: string } {
    if (p.gst) return p.gst;
    if (!p.category) throw new Error(`${p.name} has no category or GST rate`);
    return RATES[p.category];
}

/** A line's unit price in paise: its variant's, else the product's. */
export function unitPaise(product: number, variant: number | null): number {
    const p = PRODUCTS[product];
    const v = variant === null ? undefined : p.variants?.[variant];
    return (v?.price ?? p.price) * 100;
}

/** What an order line and its invoice call it: "Sourdough loaf — 800g". */
export function lineName(product: number, variant: number | null): string {
    const p = PRODUCTS[product];
    const v = variant === null ? undefined : p.variants?.[variant];
    return v ? `${p.name} — ${v.value}` : p.name;
}

/** Collections as the designs have them: one by category, three hand-picked. */
export const COLLECTIONS: readonly {
    key: string;
    name: string;
    slug: string;
    description: string;
    category?: CategoryKey;
    picked?: readonly string[];
}[] = [
    {
        key: "bread",
        name: "Bread",
        slug: "bread",
        description: "Every loaf we bake, as it goes on the shelf.",
        category: "breads",
    },
    {
        key: "weekend",
        name: "Weekend bakes",
        slug: "weekend-bakes",
        description: "What comes out of the oven on Saturday and Sunday.",
        picked: [
            "sourdough-loaf",
            "cinnamon-bun",
            "almond-croissant",
            "focaccia-rosemary",
        ],
    },
    {
        key: "gifts",
        name: "Gifts",
        slug: "gifts",
        description: "Boxes, beans and bakes that travel.",
        picked: [
            "bakers-gift-box",
            "house-blend-beans-250g",
            "almond-croissant",
            "cinnamon-bun",
        ],
    },
    {
        key: "new",
        name: "New this week",
        slug: "new-this-week",
        description: "",
        picked: ["focaccia-rosemary", "almond-croissant"],
    },
];
