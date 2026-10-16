/**
 * Rye & Co.'s catalogue shapes and vocabularies: the types and constant
 * lists both `bakery-catalogue.ts` and `bakery-cakes.ts` read. Kept apart
 * so the cakes need not import the catalogue that lists them.
 */

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
    { key: "cakes", name: "Celebration cakes" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** The business's options; a product's variants pick one option's values. */
export const OPTIONS = [
    { key: "size", name: "Size", values: ["200g", "400g", "800g"] },
    {
        key: "grind",
        name: "Grind",
        values: ["Whole bean", "Espresso", "Filter"],
    },
    { key: "pack", name: "Pack", values: ["Single", "Six-pack", "Box of 4"] },
    // The custom cakes' sizes, each with its eggless twin: a product's
    // variants pick one option's values, so size and eggless share one.
    {
        key: "cake",
        name: "Cake size",
        values: [
            "500 g",
            "1 kg",
            "1.5 kg",
            "2 kg",
            "3 kg",
            "500 g, eggless",
            "1 kg, eggless",
            "1.5 kg, eggless",
            "2 kg, eggless",
            "3 kg, eggless",
        ],
    },
    {
        key: "number",
        name: "Number",
        values: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    },
    { key: "finish", name: "Finish", values: ["Gold", "Silver", "Rose gold"] },
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
