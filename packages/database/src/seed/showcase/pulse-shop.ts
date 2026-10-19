import type { Prisma } from "@prisma/client";

import { holdOpenLines } from "../../backfill/held-stock";
import type { Db } from "../helpers";
import { id, listProductAt, setStockLevel } from "../helpers";
import { PULSE_PHOTOS } from "./catalog-photos";
import { SHOWCASE_KEY, SHOWCASE_SEED, TIMEZONE } from "./data";
import { hashKey, istAt } from "./people";
import { createRng } from "./random";
import { seasonAt } from "./traffic";

/**
 * Pulse Fitness's front counter (the owner's gym story: "sells memberships,
 * personal training, supplements and accessories"): one storefront, "Front
 * desk", that sells house-labelled supplements, gym gear and Pulse's own
 * training wear, counted per variant, and three months of members buying at
 * the counter — paid there by UPI or card and taken away.
 *
 * Structure (storefront, categories, options, products, photos, variants,
 * shelves) is upserted on seeded ids. The orders and their customers are
 * written after `seedBusiness` cleared Pulse's volume, so a re-run rewrites
 * them; the customers are Pulse's own members (the same email as their
 * contact, so `linkSeededPayers` puts their orders on their page).
 *
 * GST: prices include it. Supplements 18% (HSN 2106), the peanut butter 12%
 * (2008), clothing and textiles 5% (sold under ₹1,000: 6109, 6116, 6302,
 * 6307), the leather belt 12% (4203), sports goods 12% (9506), steel bottles
 * 12% (7323), rubber bands 18% (4016), plastic shakers 18% (3924) and the
 * bag 18% (4202) — the slabs in force before 22 September 2025, as the rest
 * of the showcase is written.
 */

const KEY = "pulse";
const sid = (...parts: (string | number)[]) => id(SHOWCASE_KEY, KEY, ...parts);
const rngFor = (...parts: string[]) =>
    createRng((SHOWCASE_SEED ^ hashKey(KEY, ...parts)) >>> 0);

export const PULSE_STORE_ID = sid("store");

type CategoryKey = "supplements" | "gear" | "apparel";
const CATEGORIES: readonly { key: CategoryKey; name: string }[] = [
    { key: "supplements", name: "Supplements" },
    { key: "gear", name: "Gym gear" },
    { key: "apparel", name: "Training wear" },
];

const OPTIONS = {
    flavour: "Flavour",
    size: "Size",
    colour: "Colour",
    pack: "Pack",
    resistance: "Resistance",
    texture: "Texture",
    weight: "Pack size",
} as const;
type OptionKey = keyof typeof OPTIONS;

interface ShopVariant {
    title: string;
    sku: string;
    /** Rupees; absent: the product's. */
    price?: number;
    mrp?: number;
    onHand: number;
}

interface ShopProduct {
    slug: string;
    name: string;
    category: CategoryKey;
    price: number;
    mrp: number | null;
    gst: { rate: string; hsn: string };
    description: string;
    keyPoints: readonly string[];
    howToUse: string | null;
    materials: string | null;
    maker: string;
    madeIn: string;
    returns: string;
    option?: OptionKey;
    variants: readonly ShopVariant[];
    /** On hand when it has no variants. */
    onHand?: number;
    warnAt: number;
    /** How often it sells, against the others. */
    demand: number;
}

const SUPP = { rate: "18.00", hsn: "21061000" };
const FOOD = { rate: "18.00", hsn: "21069099" };
const CLOTH = { rate: "5.00", hsn: "61091000" };
const SEALED =
    "Unopened and sealed, within 7 days, with the bill. Opened supplements can't be returned.";
const WEAR = "Exchange for another size within 7 days, unworn with the tag on.";
const GEAR = "Returnable within 7 days, unused, with the bill.";
const SUPP_HOW =
    "One scoop (about 30 g) in 200–250 ml of water or milk, shaken for 20 seconds. Most members take it after training. Pregnant, on medication or with a medical condition? Ask your doctor first.";
const MAKER =
    "Packed for Pulse by Fitfuel Nutrition Pvt. Ltd. (FSSAI licensed)";

/** Variants by one option, each with its own stock. */
const by = (
    sku: string,
    values: readonly (string | [string, number])[],
    stock: readonly number[],
    prices?: readonly (number | undefined)[],
): ShopVariant[] =>
    values.map((v, k) => {
        const title = typeof v === "string" ? v : v[0];
        return {
            title,
            sku: `${sku}-${title
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "")
                .slice(0, 6)}`,
            price: prices?.[k],
            onHand: stock[k] ?? 0,
        };
    });

const TEE_SIZES = ["S", "M", "L", "XL", "XXL"] as const;
const TANK_SIZES = ["S", "M", "L", "XL"] as const;

function tee(colour: string, slug: string, stock: number[]): ShopProduct {
    return {
        slug,
        name: `Pulse dry-fit T-shirt, ${colour}`,
        category: "apparel",
        price: 799,
        mrp: 999,
        gst: CLOTH,
        description: `Our coaches' T-shirt in ${colour.toLowerCase()}: a quick-dry polyester knit that doesn't cling when you sweat, flat seams that don't rub under a backpack strap, and a small Pulse mark on the chest. Regular fit — size down for a closer one.`,
        keyPoints: ["Quick-dry 160 gsm knit", "Flat seams", "Regular fit"],
        howToUse:
            "Machine wash cold, inside out. No fabric softener — it stops the fabric wicking.",
        materials: "92% polyester, 8% elastane.",
        maker: "Stitched for Pulse by Kovai Knits",
        madeIn: "Tiruppur, Tamil Nadu",
        returns: WEAR,
        option: "size",
        variants: by(
            `TEE-${colour.slice(0, 3).toUpperCase()}`,
            TEE_SIZES,
            stock,
        ),
        warnAt: 2,
        demand: 0.6,
    };
}

function tank(colour: string, slug: string, stock: number[]): ShopProduct {
    return {
        slug,
        name: `Pulse training tank, ${colour}`,
        category: "apparel",
        price: 649,
        mrp: 799,
        gst: CLOTH,
        description: `A sleeveless training top in ${colour.toLowerCase()} with a dropped armhole, for heavy upper-body days and Bengaluru afternoons. The same quick-dry knit as our T-shirts.`,
        keyPoints: ["Dropped armhole", "Quick-dry knit"],
        howToUse: "Machine wash cold, inside out.",
        materials: "92% polyester, 8% elastane.",
        maker: "Stitched for Pulse by Kovai Knits",
        madeIn: "Tiruppur, Tamil Nadu",
        returns: WEAR,
        option: "size",
        variants: by(
            `TNK-${colour.slice(0, 3).toUpperCase()}`,
            TANK_SIZES,
            stock,
        ),
        warnAt: 2,
        demand: 0.35,
    };
}

export const PULSE_PRODUCTS: readonly ShopProduct[] = [
    // --- Supplements
    {
        slug: "whey-protein-1kg",
        name: "Whey protein concentrate, 1 kg",
        category: "supplements",
        price: 2499,
        mrp: 2999,
        gst: SUPP,
        description:
            "Whey protein concentrate with about 24 g of protein in a 32 g scoop, around 31 servings in the tub. Mixes smooth in water or milk. A convenient way to reach your protein for the day when meals fall short — not a meal replacement.",
        keyPoints: [
            "About 24 g protein a scoop",
            "31 servings",
            "No added sugar in Unflavoured",
        ],
        howToUse: SUPP_HOW,
        materials:
            "Whey protein concentrate (milk), cocoa or natural flavour, emulsifier (soy lecithin), sweetener (sucralose; none in Unflavoured).",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by(
            "WPC1",
            ["Chocolate", "Vanilla", "Café mocha", "Unflavoured"],
            [14, 9, 5, 4],
        ),
        warnAt: 3,
        demand: 3,
    },
    {
        slug: "whey-protein-2kg",
        name: "Whey protein concentrate, 2 kg",
        category: "supplements",
        price: 4599,
        mrp: 5499,
        gst: SUPP,
        description:
            "The same whey as our 1 kg tub, in a 2 kg tub of about 62 servings — better value if you take a scoop most days.",
        keyPoints: ["About 24 g protein a scoop", "62 servings"],
        howToUse: SUPP_HOW,
        materials:
            "Whey protein concentrate (milk), cocoa or natural flavour, emulsifier (soy lecithin), sweetener (sucralose; none in Unflavoured).",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by(
            "WPC2",
            ["Chocolate", "Vanilla", "Café mocha", "Unflavoured"],
            [8, 4, 2, 3],
        ),
        warnAt: 3,
        demand: 1.6,
    },
    {
        slug: "whey-isolate-1kg",
        name: "Whey isolate, 1 kg",
        category: "supplements",
        price: 3799,
        mrp: 4499,
        gst: SUPP,
        description:
            "Whey protein isolate: about 27 g of protein in a 30 g scoop, with less lactose and fat than concentrate. Members who find regular whey heavy often get on better with this.",
        keyPoints: [
            "About 27 g protein a scoop",
            "Lower lactose",
            "33 servings",
        ],
        howToUse: SUPP_HOW,
        materials:
            "Whey protein isolate (milk), cocoa or natural flavour, emulsifier (soy lecithin), sucralose.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by("WPI", ["Chocolate", "Vanilla"], [7, 5]),
        warnAt: 3,
        demand: 0.9,
    },
    {
        slug: "plant-protein-1kg",
        name: "Plant protein, pea & brown rice, 1 kg",
        category: "supplements",
        price: 2299,
        mrp: 2699,
        gst: SUPP,
        description:
            "Pea and brown-rice protein for members who don't take dairy: about 21 g of protein a scoop. A little earthier than whey; best blended with a banana.",
        keyPoints: ["Dairy-free", "About 21 g protein a scoop"],
        howToUse: SUPP_HOW,
        materials:
            "Pea protein isolate, brown rice protein, cocoa (Chocolate), natural flavour, stevia.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by("PLP", ["Chocolate", "Unflavoured"], [6, 3]),
        warnAt: 2,
        demand: 0.5,
    },
    {
        slug: "creatine-monohydrate",
        name: "Creatine monohydrate",
        category: "supplements",
        price: 699,
        mrp: 899,
        gst: FOOD,
        description:
            "Plain micronised creatine monohydrate, unflavoured, 3 g a scoop. One of the most studied supplements for strength training; it is not a steroid or a stimulant.",
        keyPoints: ["3 g a scoop", "Unflavoured", "Nothing else in the tub"],
        howToUse:
            "3 g a day in water, any time of day. Drink enough water through the day. Check with your doctor if you have kidney trouble or take regular medication.",
        materials: "Creatine monohydrate (micronised).",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "weight",
        variants: by("CRT", ["100 g", "250 g"], [11, 8], [undefined, 1399]).map(
            (v, k) => ({ ...v, mrp: k === 1 ? 1699 : undefined }),
        ),
        warnAt: 3,
        demand: 1.2,
    },
    {
        slug: "pre-workout",
        name: "Pre-workout, 30 servings",
        category: "supplements",
        price: 1699,
        mrp: 1999,
        gst: SUPP,
        description:
            "A pre-workout drink with 150 mg of caffeine a scoop (about a strong filter coffee), citrulline and beta-alanine — the tingle is the beta-alanine. Not for anyone under 18, pregnant, or sensitive to caffeine.",
        keyPoints: ["150 mg caffeine a scoop", "No more than one scoop a day"],
        howToUse:
            "One scoop in 250 ml of water, 20–30 minutes before training. Not after 5pm if you want to sleep.",
        materials:
            "L-citrulline, beta-alanine, caffeine anhydrous, natural flavour, citric acid, sucralose, colour.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by(
            "PRE",
            ["Fruit punch", "Green apple", "Watermelon"],
            [6, 4, 0],
        ),
        warnAt: 2,
        demand: 0.7,
    },
    {
        slug: "bcaa",
        name: "BCAA 2:1:1, 30 servings",
        category: "supplements",
        price: 1299,
        mrp: 1599,
        gst: SUPP,
        description:
            "Branched-chain amino acids (leucine, isoleucine, valine in 2:1:1) in a light drink to sip through a long session. If you already eat enough protein you may not need them.",
        keyPoints: ["5 g BCAA a scoop", "Light, not sweet"],
        howToUse: "One scoop in 500 ml of water, sipped while you train.",
        materials:
            "L-leucine, L-isoleucine, L-valine, natural flavour, citric acid, sucralose.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by(
            "BCA",
            ["Watermelon", "Lemon iced tea", "Mango"],
            [5, 4, 6],
        ),
        warnAt: 2,
        demand: 0.6,
    },
    {
        slug: "electrolyte-sachets",
        name: "Electrolyte sachets, box of 10",
        category: "supplements",
        price: 349,
        mrp: 399,
        gst: FOOD,
        description:
            "Sodium, potassium and magnesium to stir into a bottle of water on a hot day or after a long, sweaty class. Lightly sweet.",
        keyPoints: ["One sachet in 500 ml", "For hot days and long sessions"],
        howToUse: "Empty one sachet into 500 ml of water and shake.",
        materials:
            "Dextrose, sodium citrate, potassium chloride, magnesium citrate, natural flavour, citric acid.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "flavour",
        variants: by("ELY", ["Lemon", "Orange"], [18, 12]),
        warnAt: 5,
        demand: 1.4,
    },
    ...(["Choco almond", "Peanut butter"] as const).map(
        (flavour, k): ShopProduct => ({
            slug:
                k === 0
                    ? "protein-bar-choco-almond"
                    : "protein-bar-peanut-butter",
            name: `Protein bar, ${flavour.toLowerCase()}`,
            category: "supplements",
            price: 120,
            mrp: 140,
            gst: FOOD,
            description: `A 60 g ${flavour.toLowerCase()} bar with 20 g of protein — the thing members grab on the way out when dinner is still two hours away.`,
            keyPoints: ["20 g protein a bar", "60 g bar"],
            howToUse: null,
            materials:
                k === 0
                    ? "Milk protein, whey protein, almonds, dark chocolate (soy lecithin), dates, oats, cocoa."
                    : "Milk protein, peanuts, whey protein, dates, oats, milk chocolate (soy lecithin), salt.",
            maker: MAKER,
            madeIn: "Ahmedabad, Gujarat",
            returns: SEALED,
            option: "pack",
            variants: by(
                k === 0 ? "BAR-CA" : "BAR-PB",
                ["Single", "Box of 6", "Box of 12"],
                k === 0 ? [36, 7, 4] : [30, 6, 3],
                [undefined, 690, 1320],
            ).map((v, j) => ({ ...v, mrp: [undefined, 780, 1500][j] })),
            warnAt: 3,
            demand: 2.6,
        }),
    ),
    {
        slug: "peanut-butter-high-protein",
        name: "High-protein peanut butter, 1 kg",
        category: "supplements",
        price: 549,
        mrp: 699,
        gst: { rate: "12.00", hsn: "20081100" },
        description:
            "Roasted peanuts with added whey for about 30 g of protein in 100 g. No palm oil. On toast, in oats, off the spoon.",
        keyPoints: ["About 30 g protein in 100 g", "No palm oil"],
        howToUse:
            "Stir before use; the oil settles on top. Keep it out of the fridge.",
        materials:
            "Roasted peanuts, whey protein concentrate (milk), jaggery, salt.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        option: "texture",
        variants: by("PNB", ["Crunchy", "Smooth"], [9, 6]),
        warnAt: 3,
        demand: 0.8,
    },
    {
        slug: "multivitamin",
        name: "Daily multivitamin, 60 tablets",
        category: "supplements",
        price: 699,
        mrp: 899,
        gst: SUPP,
        description:
            "A once-a-day multivitamin and mineral tablet. A supplement to a varied diet, not a substitute for one.",
        keyPoints: ["One tablet a day", "60 days"],
        howToUse:
            "One tablet a day with a meal. Don't take more than the stated dose. Ask your doctor if you are pregnant or on medication.",
        materials:
            "Vitamins A, B-complex, C, D3, E, K; zinc, magnesium, iron, selenium; bulking agents.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        variants: [],
        onHand: 12,
        warnAt: 3,
        demand: 0.5,
    },
    {
        slug: "omega-3",
        name: "Omega-3 fish oil, 60 softgels",
        category: "supplements",
        price: 899,
        mrp: 1099,
        gst: SUPP,
        description:
            "Fish oil softgels with 300 mg of EPA and DHA in each. Not suitable for vegetarians.",
        keyPoints: ["300 mg EPA + DHA a softgel", "60 softgels"],
        howToUse:
            "One or two softgels a day with food. Ask your doctor first if you take blood thinners.",
        materials: "Fish oil, gelatin (softgel), glycerin, vitamin E.",
        maker: MAKER,
        madeIn: "Ahmedabad, Gujarat",
        returns: SEALED,
        variants: [],
        onHand: 4,
        warnAt: 4,
        demand: 0.4,
    },
    // --- Gear
    {
        slug: "shaker-bottle",
        name: "Shaker bottle, 700 ml",
        category: "gear",
        price: 349,
        mrp: 449,
        gst: { rate: "18.00", hsn: "39241090" },
        description:
            "A leak-proof 700 ml shaker with a steel mixing ball and a flip cap that snaps shut. BPA-free.",
        keyPoints: ["700 ml", "Steel mixing ball", "BPA-free"],
        howToUse: "Rinse straight after use; dishwasher safe on the top rack.",
        materials: "Polypropylene, stainless steel ball.",
        maker: "Pulse Fitness",
        madeIn: "Mumbai, Maharashtra",
        returns: GEAR,
        option: "colour",
        variants: by("SHK", ["Black", "Red", "Blue", "Grey"], [16, 7, 6, 4]),
        warnAt: 3,
        demand: 1.5,
    },
    {
        slug: "steel-water-bottle",
        name: "Steel water bottle, 1 litre",
        category: "gear",
        price: 799,
        mrp: 999,
        gst: { rate: "12.00", hsn: "73239390" },
        description:
            "Double-walled stainless steel: cold for 18 hours, no sweat on the bench. Fits a car cup holder.",
        keyPoints: ["1 litre", "Cold for 18 hours"],
        howToUse: "Hand wash. Not for the freezer or microwave.",
        materials: "18/8 stainless steel, silicone seal.",
        maker: "Pulse Fitness",
        madeIn: "Moradabad, Uttar Pradesh",
        returns: GEAR,
        option: "colour",
        variants: by("BTL", ["Silver", "Forest green"], [8, 5]),
        warnAt: 2,
        demand: 0.6,
    },
    {
        slug: "lifting-gloves",
        name: "Lifting gloves",
        category: "gear",
        price: 599,
        mrp: 799,
        gst: { rate: "5.00", hsn: "61169990" },
        description:
            "Padded palm gloves with a wrist strap, for members whose hands blister on the pull-up bar.",
        keyPoints: ["Padded palm", "Wrist strap"],
        howToUse: "Hand wash cold and air dry.",
        materials: "Neoprene, synthetic leather palm, hook-and-loop strap.",
        maker: "Pulse Fitness",
        madeIn: "Jalandhar, Punjab",
        returns: GEAR,
        option: "size",
        variants: by("GLV", ["S", "M", "L", "XL"], [4, 7, 6, 2]),
        warnAt: 2,
        demand: 0.5,
    },
    {
        slug: "lifting-belt-leather",
        name: "Leather lifting belt, 10 mm",
        category: "gear",
        price: 2499,
        mrp: 2999,
        gst: { rate: "12.00", hsn: "42033000" },
        description:
            "A 10 mm, 4-inch leather belt with a single-prong buckle, for heavy squats and deadlifts. Ask a coach to show you how to brace into it before your first heavy set.",
        keyPoints: ["10 mm leather", "4 inches all round"],
        howToUse:
            "Measure your waist where the belt sits, not your trouser size. S 66–80 cm, M 76–92 cm, L 88–104 cm, XL 100–116 cm.",
        materials: "Vegetable-tanned leather, steel buckle.",
        maker: "Pulse Fitness",
        madeIn: "Kanpur, Uttar Pradesh",
        returns: GEAR,
        option: "size",
        variants: by("BLT", ["S", "M", "L", "XL"], [2, 3, 3, 1]),
        warnAt: 1,
        demand: 0.25,
    },
    {
        slug: "wrist-wraps",
        name: "Wrist wraps, pair",
        category: "gear",
        price: 449,
        mrp: 599,
        gst: { rate: "5.00", hsn: "63079090" },
        description:
            "Stiff 45 cm wraps with a thumb loop, for pressing heavy. Wrap firmly, not tightly.",
        keyPoints: ["45 cm", "Thumb loop"],
        howToUse: "Hand wash cold.",
        materials: "Cotton-elastic blend, hook-and-loop closure.",
        maker: "Pulse Fitness",
        madeIn: "Jalandhar, Punjab",
        returns: GEAR,
        option: "colour",
        variants: by("WRP", ["Black", "Red"], [7, 4]),
        warnAt: 2,
        demand: 0.35,
    },
    {
        slug: "resistance-bands",
        name: "Resistance loop bands",
        category: "gear",
        price: 399,
        mrp: 499,
        gst: { rate: "18.00", hsn: "40169990" },
        description:
            "Latex loop bands for warm-ups, glute work and assisted pull-ups — the same ones we use in class.",
        keyPoints: ["Natural latex", "Colour-coded by resistance"],
        howToUse: "Check for nicks before each use; keep out of direct sun.",
        materials: "Natural latex.",
        maker: "Pulse Fitness",
        madeIn: "Kottayam, Kerala",
        returns: GEAR,
        option: "resistance",
        variants: by(
            "RBD",
            ["Light", "Medium", "Heavy", "Set of 3"],
            [8, 9, 6, 5],
            [undefined, 449, 549, 1199],
        ),
        warnAt: 2,
        demand: 0.6,
    },
    {
        slug: "skipping-rope",
        name: "Speed skipping rope",
        category: "gear",
        price: 499,
        mrp: 699,
        gst: { rate: "12.00", hsn: "95069190" },
        description:
            "A coated steel speed rope on ball-bearing handles; cut it to your height at the counter.",
        keyPoints: ["Adjustable length", "Ball-bearing handles"],
        howToUse: "Stand on the middle; the handles should reach your armpits.",
        materials: "PVC-coated steel cable, aluminium handles.",
        maker: "Pulse Fitness",
        madeIn: "Meerut, Uttar Pradesh",
        returns: GEAR,
        variants: [],
        onHand: 9,
        warnAt: 3,
        demand: 0.4,
    },
    {
        slug: "foam-roller",
        name: "Foam roller, 33 cm",
        category: "gear",
        price: 899,
        mrp: 1199,
        gst: { rate: "12.00", hsn: "95069190" },
        description:
            "A firm, textured roller for calves, quads and upper back after training.",
        keyPoints: ["33 cm × 14 cm", "Firm EVA foam"],
        howToUse:
            "Roll slowly; stop on a tender spot for a few breaths. Not on the lower back.",
        materials: "EVA foam over a hollow core.",
        maker: "Pulse Fitness",
        madeIn: "Meerut, Uttar Pradesh",
        returns: GEAR,
        variants: [],
        onHand: 6,
        warnAt: 2,
        demand: 0.3,
    },
    {
        slug: "yoga-mat",
        name: "Yoga mat, 6 mm",
        category: "gear",
        price: 1199,
        mrp: 1499,
        gst: { rate: "12.00", hsn: "95069190" },
        description:
            "A 6 mm mat with a grippy top that stays put in a sweaty yoga flow, with a carry strap.",
        keyPoints: ["6 mm", "183 × 61 cm", "Carry strap"],
        howToUse: "Wipe with a damp cloth; dry flat before rolling.",
        materials: "TPE foam.",
        maker: "Pulse Fitness",
        madeIn: "Meerut, Uttar Pradesh",
        returns: GEAR,
        option: "colour",
        variants: by("MAT", ["Charcoal", "Teal"], [5, 4]),
        warnAt: 2,
        demand: 0.35,
    },
    {
        slug: "gym-towel",
        name: "Gym towel",
        category: "gear",
        price: 399,
        mrp: 499,
        gst: { rate: "5.00", hsn: "63026090" },
        description:
            "A quick-dry 40 × 80 cm towel for the bench — the floor rules ask for one.",
        keyPoints: ["40 × 80 cm", "Quick-dry"],
        howToUse: "Machine wash warm.",
        materials: "Microfibre.",
        maker: "Pulse Fitness",
        madeIn: "Solapur, Maharashtra",
        returns: GEAR,
        option: "colour",
        variants: by("TWL", ["Grey", "White"], [12, 8]),
        warnAt: 3,
        demand: 0.7,
    },
    {
        slug: "gym-bag",
        name: "Gym duffel bag",
        category: "gear",
        price: 1499,
        mrp: 1999,
        gst: { rate: "18.00", hsn: "42029200" },
        description:
            "A 35-litre duffel with a separate shoe pocket and a wet pocket for your towel.",
        keyPoints: ["35 litres", "Shoe pocket", "Wet pocket"],
        howToUse: "Wipe clean.",
        materials: "Polyester canvas, water-resistant lining.",
        maker: "Pulse Fitness",
        madeIn: "Mumbai, Maharashtra",
        returns: GEAR,
        variants: [],
        onHand: 5,
        warnAt: 2,
        demand: 0.25,
    },
    // --- Training wear
    tee("Black", "pulse-tee-black", [5, 9, 8, 6, 3]),
    tee("Heather grey", "pulse-tee-grey", [3, 6, 7, 4, 2]),
    tee("Navy", "pulse-tee-navy", [4, 6, 5, 4, 2]),
    tee("Red", "pulse-tee-red", [2, 4, 4, 3, 0]),
    tank("Black", "pulse-tank-black", [3, 6, 5, 3]),
    tank("Grey", "pulse-tank-grey", [2, 5, 4, 2]),
];

const rupees = (n: number) => `${n}.00`;
const rupeesOf = (p: number) =>
    `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;

/** The counter's week, Monday first: 6am to 10pm, Sunday mornings. */
const HOURS = [
    { day: "MON", open: "06:00", close: "22:00", closed: false },
    { day: "TUE", open: "06:00", close: "22:00", closed: false },
    { day: "WED", open: "06:00", close: "22:00", closed: false },
    { day: "THU", open: "06:00", close: "22:00", closed: false },
    { day: "FRI", open: "06:00", close: "22:00", closed: false },
    { day: "SAT", open: "06:00", close: "20:00", closed: false },
    { day: "SUN", open: "07:00", close: "12:00", closed: false },
];

interface Placed {
    p: ShopProduct;
    productId: string;
    variantIds: string[];
    shelfIds: string[];
}

export async function seedPulseShop(
    prisma: Db,
    a: { orgId: string; now: Date; ownerUserId: string },
): Promise<{ products: number; orders: number; customers: number }> {
    const { orgId, now } = a;
    const storeId = PULSE_STORE_ID;
    const createdAt = istAt(now, -100, 10 * 60);

    // The business counts stock (#515).
    await prisma.businessProfile.update({
        where: { organizationId: orgId },
        data: { stockTracking: true },
    });

    // --- the storefront: the front desk, a place people walk into
    await prisma.store.upsert({
        where: { id: storeId },
        update: { name: "Front desk", organizationId: orgId, deletedAt: null },
        create: {
            id: storeId,
            organizationId: orgId,
            name: "Front desk",
            description:
                "Supplements, gear and Pulse training wear at the counter.",
            createdAt,
        },
    });
    await prisma.storeOwner.upsert({
        where: { storeId_userId: { storeId, userId: a.ownerUserId } },
        update: { role: "OWNER" },
        create: {
            id: sid("storeowner"),
            storeId,
            userId: a.ownerUserId,
            role: "OWNER",
        },
    });
    const settings = {
        currency: "INR",
        timezone: TIMEZONE,
        kind: "SHOP",
        address: "80 Feet Road, Koramangala, Bengaluru 560034",
        openingHours: HOURS,
        collectionEnabled: true,
        taxEnabled: false,
    };
    await prisma.storeSettings.upsert({
        where: { storeId },
        update: settings,
        create: { id: sid("storesettings"), storeId, ...settings },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId },
        update: { ecommerceEnabled: true },
        create: { id: sid("storefeatures"), storeId, ecommerceEnabled: true },
    });

    // --- categories and options
    const categoryId = {} as Record<CategoryKey, string>;
    for (const c of CATEGORIES) {
        const row = await prisma.category.upsert({
            where: {
                organizationId_slug: { organizationId: orgId, slug: c.key },
            },
            update: { name: c.name },
            create: {
                id: sid("category", c.key),
                organizationId: orgId,
                name: c.name,
                slug: c.key,
            },
        });
        categoryId[c.key] = row.id;
    }
    const optionId = {} as Record<OptionKey, string>;
    const valueId = new Map<string, string>();
    const keys = Object.keys(OPTIONS) as OptionKey[];
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const row = await prisma.productOption.upsert({
            where: {
                organizationId_name: {
                    organizationId: orgId,
                    name: OPTIONS[k],
                },
            },
            update: { position: i },
            create: {
                id: sid("option", k),
                organizationId: orgId,
                name: OPTIONS[k],
                position: i,
            },
        });
        optionId[k] = row.id;
        const values = Array.from(
            new Set(
                PULSE_PRODUCTS.filter((p) => p.option === k).flatMap((p) =>
                    p.variants.map((v) => v.title),
                ),
            ),
        );
        for (let j = 0; j < values.length; j++) {
            const v = await prisma.productOptionValue.upsert({
                where: {
                    optionId_value: { optionId: row.id, value: values[j] },
                },
                update: { position: j },
                create: {
                    id: sid("optionvalue", k, j),
                    optionId: row.id,
                    organizationId: orgId,
                    value: values[j],
                    position: j,
                },
            });
            valueId.set(`${k}:${values[j]}`, v.id);
        }
    }

    // --- products, photos, variants, listings and shelves
    const placed: Placed[] = [];
    for (let i = 0; i < PULSE_PRODUCTS.length; i++) {
        const p = PULSE_PRODUCTS[i];
        const productId = sid("product", p.slug);
        const photos = PULSE_PHOTOS[p.slug] ?? [];
        const data = {
            name: p.name,
            description: `<p>${p.description}</p>`,
            price: rupees(p.price),
            mrp: p.mrp === null ? null : rupees(p.mrp),
            currency: "INR",
            status: "PUBLISHED",
            categoryId: categoryId[p.category],
            optionId: p.option ? optionId[p.option] : null,
            keyPoints: [...p.keyPoints],
            howToUse: p.howToUse,
            materials: p.materials,
            madeHere: false,
            maker: p.maker,
            madeIn: p.madeIn,
            returnsMode: "OWN",
            returnsText: p.returns,
            gstRate: p.gst.rate,
            hsnCode: p.gst.hsn,
            image: photos[0]?.url ?? null,
            shopFields: {
                howToUse: true,
                materials: true,
                keyPoints: true,
                maker: true,
                warranty: false,
                returns: true,
            },
        };
        await prisma.product.upsert({
            where: { id: productId },
            update: data,
            create: {
                id: productId,
                storeId,
                organizationId: orgId,
                slug: p.slug,
                createdAt: istAt(now, -95 + i, 11 * 60),
                ...data,
            },
        });
        // Photos: rewritten whole, the first the cover.
        await prisma.productVariant.updateMany({
            where: { productId },
            data: { imageId: null },
        });
        await prisma.productImage.deleteMany({ where: { productId } });
        const imageIds = photos.map((_, k) => sid("image", p.slug, k));
        if (photos.length) {
            await prisma.productImage.createMany({
                data: photos.map((ph, k) => ({
                    id: imageIds[k],
                    productId,
                    organizationId: orgId,
                    url: ph.url,
                    alt: ph.alt,
                    width: ph.width,
                    height: ph.height,
                    position: k,
                    creditName: ph.creditName,
                    creditUrl: ph.creditUrl,
                })),
            });
        }
        const variantIds: string[] = [];
        for (let j = 0; j < p.variants.length; j++) {
            const v = p.variants[j];
            const variantId = sid("variant", p.slug, j);
            const photoAt = photos.findIndex((ph) => ph.variant === v.title);
            const vdata = {
                sku: v.sku,
                title: v.title,
                price: v.price === undefined ? null : rupees(v.price),
                mrp: v.mrp === undefined ? null : rupees(v.mrp),
                position: j,
                optionValueId: p.option
                    ? (valueId.get(`${p.option}:${v.title}`) ?? null)
                    : null,
                imageId: photoAt >= 0 ? imageIds[photoAt] : null,
            };
            await prisma.productVariant.upsert({
                where: { id: variantId },
                update: vdata,
                create: { id: variantId, productId, ...vdata },
            });
            variantIds.push(variantId);
        }
        await listProductAt(prisma, {
            id: sid("listing", p.slug),
            orgId,
            storeId,
            productId,
            variants: variantIds.map((variantId, j) => ({
                id: sid("listingvariant", p.slug, j),
                variantId,
            })),
        });
        const shelfIds: string[] = [];
        if (p.variants.length === 0) {
            shelfIds.push(
                await setStockLevel(prisma, {
                    id: sid("stocklevel", p.slug),
                    orgId,
                    storeId,
                    productId,
                    onHand: p.onHand ?? 0,
                    promised: 0,
                    lowStockAlert: p.warnAt,
                }),
            );
        } else {
            for (let j = 0; j < p.variants.length; j++) {
                shelfIds.push(
                    await setStockLevel(prisma, {
                        id: sid("stocklevel", p.slug, j),
                        orgId,
                        storeId,
                        productId,
                        variantId: variantIds[j],
                        onHand: p.variants[j].onHand,
                        promised: 0,
                        lowStockAlert: p.warnAt,
                    }),
                );
            }
        }
        await prisma.product.update({
            where: { id: productId },
            data: { stockTracked: true, stockTrackedAt: createdAt },
        });
        placed.push({ p, productId, variantIds, shelfIds });
    }

    // --- the members who buy at the counter, and what they bought
    const members = await prisma.contact.findMany({
        where: {
            organizationId: orgId,
            id: { startsWith: sid("contact", "") },
            OR: [
                { subscriptions: { some: {} } },
                { packPurchases: { some: {} } },
            ],
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
        },
        orderBy: { id: "asc" },
    });
    const { customers, orders, items } = planCounter({
        now,
        orgId,
        storeId,
        placed,
        members,
    });
    await prisma.customer.createMany({ data: customers });
    await prisma.order.createMany({ data: orders });
    await prisma.orderItem.createMany({ data: items });
    // The few open ones hold their units, as the counter's reserve does.
    await holdOpenLines(prisma, {
        organizationId: orgId,
        orderIdPrefix: sid(""),
    });
    return {
        products: placed.length,
        orders: orders.length,
        customers: customers.length,
    };
}

const NOTES = [
    "Keep a 2 kg chocolate aside — collecting after the evening class.",
    "Member asked for the bill on email for office reimbursement.",
    "Swapped a T-shirt from M to L.",
    "Paid by the coach's referral code at the desk.",
];

function planCounter(a: {
    now: Date;
    orgId: string;
    storeId: string;
    placed: readonly Placed[];
    members: readonly {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
    }[];
}) {
    const rng = rngFor("counter");
    const { now } = a;
    // A hundred-odd regular buyers among the members; a few buy most.
    const buyers = a.members.filter((m) => m.email).slice(0, 110);
    const customers: Prisma.CustomerCreateManyInput[] = [];
    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const firstAt = new Map<number, Date>();
    let n = 0;
    for (let d = -90; d <= 0; d++) {
        const noon = istAt(now, d, 12 * 60);
        const weekday = new Date(noon.getTime() + 330 * 60_000).getUTCDay();
        // Enough that any 30 days clears the 120 the check below asks for,
        // whatever weekday and season the seed runs on (it fell to 118 on
        // a Monday morning in October).
        const base = weekday === 0 ? 1.5 : weekday === 6 ? 5 : 6;
        const mean = base * seasonAt("gym", noon);
        let count = Math.max(
            0,
            Math.round(mean + (rng.next() + rng.next() - 1) * 2.5),
        );
        if (d === 0) count = Math.min(count, 3);
        for (let k = 0; k < count; k++) {
            // Mornings before work and evenings after it.
            const minute = rng.chance(0.45)
                ? rng.int(6 * 60 + 30, 10 * 60)
                : rng.int(17 * 60 + 30, 21 * 60 + 30);
            const placedAt = istAt(now, d, minute);
            if (placedAt > now) continue;
            const b = rng.skewed(buyers.length, 1.6);
            if (!firstAt.has(b)) firstAt.set(b, placedAt);
            const orderId = sid("order", "c", n);
            const lines = rng.weighted([1, 2, 3], (x) =>
                x === 1 ? 7 : x === 2 ? 3 : 1,
            );
            const chosen: Placed[] = [];
            while (chosen.length < lines) {
                const p = rng.weighted(a.placed, (x) => x.p.demand);
                if (!chosen.includes(p)) chosen.push(p);
            }
            let subtotal = 0;
            let tax = 0;
            chosen.forEach((pl, line) => {
                const j = pl.variantIds.length
                    ? rng.int(0, pl.variantIds.length - 1)
                    : -1;
                const v = j >= 0 ? pl.p.variants[j] : undefined;
                const price = v?.price ?? pl.p.price;
                const qty =
                    pl.p.slug.startsWith("protein-bar") && v?.title === "Single"
                        ? rng.int(1, 4)
                        : 1;
                const amount = price * 100 * qty;
                subtotal += amount;
                const rate = Number(pl.p.gst.rate);
                tax += Math.round((amount * rate) / (100 + rate));
                items.push({
                    id: sid("orderitem", "c", n, line),
                    orderId,
                    productId: pl.productId,
                    variantId: j >= 0 ? pl.variantIds[j] : null,
                    quantity: qty,
                    price: rupees(price),
                });
            });
            // Today's last few wait at the desk; a sealed tub now and then
            // comes back.
            const open = d === 0 && k >= count - 2;
            const returned = !open && rng.chance(0.012);
            orders.push({
                id: orderId,
                storeId: a.storeId,
                organizationId: a.orgId,
                orderId: "",
                customerId: sid("customer", "c", b),
                subtotal: rupeesOf(subtotal),
                tax: rupeesOf(tax),
                shipping: "0.00",
                discount: "0.00",
                total: rupeesOf(subtotal),
                currency: "INR",
                status: open ? "PENDING" : returned ? "CANCELLED" : "DELIVERED",
                paymentStatus: open ? "UNPAID" : returned ? "REFUNDED" : "PAID",
                stage: open ? "NEW" : returned ? "NEW" : "COLLECTED",
                fulfilment: "PICKUP",
                paidByHand: open ? "0.00" : rupeesOf(subtotal),
                refundedByHand: returned ? rupeesOf(subtotal) : "0.00",
                paidAt: open ? null : new Date(placedAt.getTime() + 60_000),
                notes: open
                    ? NOTES[0]
                    : rng.chance(0.03)
                      ? rng.pick(NOTES.slice(1))
                      : null,
                placedOnline: false,
                createdAt: placedAt,
                updatedAt: new Date(
                    Math.min(
                        now.getTime(),
                        placedAt.getTime() +
                            (returned ? 2 * 86_400_000 : 120_000),
                    ),
                ),
            });
            n += 1;
        }
    }
    for (const [b, at] of Array.from(firstAt.entries())) {
        const m = buyers[b];
        customers.push({
            id: sid("customer", "c", b),
            storeId: a.storeId,
            organizationId: a.orgId,
            email: m.email ?? "",
            firstName: m.firstName,
            lastName: m.lastName,
            phone: m.phone,
            country: "India",
            state: "Karnataka",
            city: "Bengaluru",
            createdAt: new Date(at.getTime() - 60_000),
            updatedAt: new Date(at.getTime() - 60_000),
        });
    }
    orders.sort(
        (x, y) =>
            new Date(x.createdAt ?? 0).getTime() -
                new Date(y.createdAt ?? 0).getTime() ||
            String(x.id).localeCompare(String(y.id)),
    );
    orders.forEach((o, k) => {
        o.orderId = `PF-${String(1001 + k)}`;
    });
    return { customers, orders, items };
}

/**
 * What the front desk must show: a catalogue under the showcase's cap of
 * 100 products, three months of counter sales at a gym's pace by its own
 * members, a sold-out and a low variant, open orders holding what they
 * promise, and the journal live.
 */
export async function checkPulseShop(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<Record<string, number>> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [products, orders30, payers, notMembers, posts] = await Promise.all([
        prisma.product.count({ where: { organizationId: orgId } }),
        prisma.order.count({
            where: {
                organizationId: orgId,
                paymentStatus: "PAID",
                createdAt: { gte: since },
            },
        }),
        prisma.order
            .findMany({
                where: { organizationId: orgId, paymentStatus: "PAID" },
                distinct: ["customerId"],
                select: { customerId: true },
            })
            .then((r) => r.length),
        prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*) AS n FROM "Customer" c
            WHERE c."organizationId" = ${orgId}
              AND NOT EXISTS (SELECT 1 FROM "Contact" k
                  WHERE k."organizationId" = ${orgId} AND lower(k.email) = lower(c.email))`.then(
            (r) => Number(r[0]?.n ?? 0),
        ),
        prisma.post.count({
            where: {
                site: { organizationId: orgId },
                currentPublicationId: { not: null },
            },
        }),
    ]);
    const shelves = await prisma.$queryRaw<
        { out: bigint; low: bigint; off: bigint }[]
    >`
        SELECT COUNT(*) FILTER (WHERE "onHand" - promised <= 0) AS out,
               COUNT(*) FILTER (WHERE "onHand" - promised > 0 AND "onHand" - promised <= "lowStockAlert") AS low,
               COUNT(*) FILTER (WHERE promised <> COALESCE((
                   SELECT SUM(i."heldQuantity") FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
                   WHERE i."stockLevelId" = s.id AND o.status IN ('PENDING', 'PROCESSING')), 0)) AS off
        FROM "StockLevel" s WHERE "organizationId" = ${orgId}`;
    const s = shelves.at(0);
    const counts = {
        products,
        orders30,
        payers,
        notMembers,
        soldOut: Number(s?.out ?? 0),
        low: Number(s?.low ?? 0),
        promisedOff: Number(s?.off ?? 0),
        posts,
    };
    const missing = Object.entries({
        "no more than 100 products": products <= 100,
        "120 or more paid counter orders in 30 days": orders30 >= 120,
        "80 or more members who paid at the counter": payers >= 80,
        "every buyer a member (a contact)": notMembers === 0,
        "a sold-out variant": counts.soldOut >= 1,
        "a low variant": counts.low >= 1,
        "promises that match open orders": counts.promisedOff === 0,
        "24 or more posts on the journal": posts >= 24,
    }).flatMap(([what, ok]) => (ok ? [] : [what]));
    if (missing.length > 0) {
        throw new Error(
            `Pulse Fitness's front desk is missing: ${missing.join("; ")} (${JSON.stringify(counts)})`,
        );
    }
    return counts;
}
