import type { BakeryProduct, BakeryVariant } from "./bakery-catalogue-types";

/**
 * Rye & Co.'s custom cakes (the owner's birthday-and-anniversary story):
 * eight cakes baked after the order, with 48 hours' notice, and the four
 * extras people add to them. Data only, appended to `PRODUCTS` after the
 * fifteen the films use, so no index, shelf or history moves.
 *
 * - Never counted (`tracked: false`): nothing sits on a shelf, so the
 *   Products list's "Needs you" is unchanged.
 * - Sold at Hill Road and on the website, by size with an eggless twin
 *   where the recipe allows (one option a product: "Cake size").
 * - Prices include GST, 18% as pastry (HSN 1905 90 20); candles 12%
 *   (3406), the acrylic topper 18% (3926), the chocolate plaque 18% (1806).
 * - Allergens are the product's: an eggless variant still lists eggs, as
 *   the allergen list is per product — the description says which.
 */

type Size = "500 g" | "1 kg" | "1.5 kg" | "2 kg" | "3 kg";

const NOTICE = "Made after you order — 48 hours' notice";
const READY =
    "Made to order with 48 hours' notice. Collect from Hill Road from 10am, or have it delivered in Bengaluru.";
const RETURNS =
    "Made to order, so not returnable. Tell us within two hours of collection or delivery if anything is wrong.";

const skuSize = (size: Size) =>
    size === "500 g" ? "500G" : size.replace(".", "").replace(" kg", "K");
const kgOf = (size: Size) =>
    size === "500 g" ? 0.5 : Number(size.replace(" kg", ""));

/** Each size, then (when the recipe allows) each size eggless, at ₹`perKg` more a kilo. */
function sizes(
    sku: string,
    prices: Partial<Record<Size, number>>,
    egglessPerKg: number | null,
): BakeryVariant[] {
    const list = Object.entries(prices) as [Size, number][];
    return [
        ...list.map(([size, price]) => ({
            sku: `${sku}-${skuSize(size)}`,
            value: size,
            price,
        })),
        ...(egglessPerKg === null
            ? []
            : list.map(([size, price]) => ({
                  sku: `${sku}-${skuSize(size)}-EL`,
                  value: `${size}, eggless`,
                  price: price + Math.round(egglessPerKg * kgOf(size)),
              }))),
    ];
}

function cake(
    p: Pick<
        BakeryProduct,
        | "slug"
        | "name"
        | "description"
        | "ingredients"
        | "contains"
        | "mayContain"
    > & { keyPoints?: readonly string[]; variants: BakeryVariant[] },
): BakeryProduct {
    return {
        ...p,
        price: Math.min(...p.variants.map((v) => v.price ?? 0)),
        category: "cakes",
        keyPoints: [NOTICE, ...(p.keyPoints ?? [])],
        ready: READY,
        returns: RETURNS,
        tracked: false,
        option: "cake",
        stores: ["H", "O"],
    };
}

const MESSAGE = "A message on the cake, free (up to 30 characters)";

export const CAKES: readonly BakeryProduct[] = [
    cake({
        slug: "chocolate-truffle-cake",
        name: "Belgian chocolate truffle cake",
        description:
            "Three layers of dark chocolate sponge with a Belgian dark chocolate ganache, finished with a glossy glaze. The birthday cake people ask for by name.",
        keyPoints: [MESSAGE, "Eggless on request"],
        ingredients:
            "Wheat flour, dark chocolate (cocoa solids, sugar, soy lecithin), cream, butter, sugar, eggs (not in the eggless cake), cocoa, milk.",
        contains: ["Gluten", "Milk", "Eggs", "Soy"],
        mayContain: ["Nuts"],
        variants: sizes(
            "CTC",
            { "500 g": 750, "1 kg": 1450, "1.5 kg": 2100, "2 kg": 2750 },
            100,
        ),
    }),
    cake({
        slug: "red-velvet-cake",
        name: "Red velvet cake",
        description:
            "Buttermilk sponge with a little cocoa, layered and covered with a tangy cream-cheese frosting. Coloured with beetroot, not dye.",
        keyPoints: [MESSAGE, "Eggless on request"],
        ingredients:
            "Wheat flour, cream cheese, butter, sugar, buttermilk, eggs (not in the eggless cake), cocoa, beetroot powder.",
        contains: ["Gluten", "Milk", "Eggs"],
        mayContain: ["Nuts"],
        variants: sizes(
            "RVC",
            { "500 g": 800, "1 kg": 1550, "1.5 kg": 2250, "2 kg": 2950 },
            200,
        ),
    }),
    cake({
        slug: "black-forest-cake",
        name: "Black forest cake",
        description:
            "The classic: chocolate sponge soaked in cherry syrup, whipped cream and morello cherries, dark chocolate shavings on top.",
        keyPoints: [MESSAGE, "Eggless on request"],
        ingredients:
            "Wheat flour, fresh cream, morello cherries, dark chocolate (soy lecithin), sugar, eggs (not in the eggless cake), cocoa.",
        contains: ["Gluten", "Milk", "Eggs", "Soy"],
        mayContain: ["Nuts"],
        variants: sizes(
            "BFC",
            { "500 g": 650, "1 kg": 1250, "1.5 kg": 1800, "2 kg": 2350 },
            100,
        ),
    }),
    cake({
        slug: "rasmalai-cake",
        name: "Rasmalai cake",
        description:
            "Saffron and cardamom sponge soaked in rabdi, layered with rasmalai and whipped cream, topped with pistachio and dried rose petals. Always eggless.",
        keyPoints: [MESSAGE, "Always eggless", "Our Diwali favourite"],
        ingredients:
            "Wheat flour, milk, rasmalai (milk, sugar), fresh cream, sugar, pistachio, saffron, cardamom, rose petals.",
        contains: ["Gluten", "Milk", "Nuts"],
        mayContain: [],
        variants: [
            { sku: "RMC-500G-EL", value: "500 g, eggless", price: 850 },
            { sku: "RMC-1K-EL", value: "1 kg, eggless", price: 1650 },
            { sku: "RMC-15K-EL", value: "1.5 kg, eggless", price: 2400 },
            { sku: "RMC-2K-EL", value: "2 kg, eggless", price: 3150 },
        ],
    }),
    cake({
        slug: "lemon-blueberry-cake",
        name: "Lemon & blueberry cake",
        description:
            "Lemon sponge with our own lemon curd and a blueberry compote, under a light mascarpone cream. The curd needs eggs, so there is no eggless version.",
        keyPoints: [MESSAGE],
        ingredients:
            "Wheat flour, butter, eggs, sugar, lemons, blueberries, mascarpone, cream.",
        contains: ["Gluten", "Milk", "Eggs"],
        mayContain: ["Nuts"],
        variants: sizes(
            "LBC",
            { "500 g": 800, "1 kg": 1550, "1.5 kg": 2250 },
            null,
        ),
    }),
    cake({
        slug: "coffee-walnut-cake",
        name: "Coffee walnut cake",
        description:
            "Brown-sugar sponge made with our house espresso, toasted walnuts all through it and a coffee buttercream.",
        keyPoints: [MESSAGE, "Made with our house blend", "Eggless on request"],
        ingredients:
            "Wheat flour, butter, brown sugar, walnuts, espresso, eggs (not in the eggless cake), milk.",
        contains: ["Gluten", "Milk", "Eggs", "Nuts"],
        mayContain: [],
        variants: sizes(
            "CWC",
            { "500 g": 700, "1 kg": 1350, "1.5 kg": 1950, "2 kg": 2550 },
            100,
        ),
    }),
    cake({
        slug: "vanilla-fruit-cake",
        name: "Vanilla bean & seasonal fruit cake",
        description:
            "Vanilla-bean sponge with whipped cream and whatever fruit is best that week: strawberries in winter, mango in May, kiwi and berries in between.",
        keyPoints: [
            MESSAGE,
            "The fruit changes with the season",
            "Eggless on request",
        ],
        ingredients:
            "Wheat flour, fresh cream, seasonal fruit, sugar, butter, eggs (not in the eggless cake), vanilla.",
        contains: ["Gluten", "Milk", "Eggs"],
        mayContain: ["Nuts"],
        variants: sizes(
            "VFC",
            { "500 g": 650, "1 kg": 1250, "1.5 kg": 1800, "2 kg": 2350 },
            100,
        ),
    }),
    cake({
        slug: "theme-cake",
        name: "Theme cake, your design",
        description:
            "A cake drawn up with you: a cartoon for a fifth birthday, a cricket pitch, a photo printed on edible paper. Send us a picture and we'll sketch it back to you before we bake. Any of our flavours inside.",
        keyPoints: [
            "A sketch sent to you before we bake",
            "From 1 kg",
            "Eggless on request",
        ],
        ingredients:
            "Depends on the flavour you choose; fondant (sugar, glucose), edible colours and edible paper on the design.",
        contains: ["Gluten", "Milk", "Eggs"],
        mayContain: ["Nuts", "Soy"],
        variants: sizes(
            "THC",
            { "1 kg": 2200, "1.5 kg": 3200, "2 kg": 4200, "3 kg": 6200 },
            100,
        ),
    }),
    // --- the extras
    {
        slug: "birthday-candles",
        name: "Birthday candles, pack of 12",
        category: null,
        price: 60,
        description:
            "Thin striped candles in mixed colours, with holders. Each burns for about ten minutes.",
        contains: [],
        mayContain: [],
        gst: { bps: 1200, code: "3406" },
        maker: "Deepam Candles, Sivakasi",
        returns: null,
        tracked: false,
        stores: ["H", "O"],
    },
    {
        slug: "number-candle",
        name: "Number candle",
        category: null,
        price: 50,
        description:
            "A 7 cm number in gold glitter, one digit to a candle. For a 25th, add a 2 and a 5.",
        contains: [],
        mayContain: [],
        gst: { bps: 1200, code: "3406" },
        maker: "Deepam Candles, Sivakasi",
        returns: null,
        tracked: false,
        option: "number",
        variants: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
            (d) => ({ sku: `NC-${d}`, value: d }),
        ),
        stores: ["H", "O"],
    },
    {
        slug: "cake-topper",
        name: "“Happy Birthday” cake topper",
        category: null,
        price: 199,
        description:
            "A reusable acrylic topper on two picks, 15 cm wide. Wipe it clean and keep it for next year.",
        contains: [],
        mayContain: [],
        gst: { bps: 1800, code: "3926" },
        maker: "Papercraft Studio, Mumbai",
        returns: null,
        tracked: false,
        option: "finish",
        variants: [
            { sku: "TOP-GLD", value: "Gold" },
            { sku: "TOP-SLV", value: "Silver" },
            { sku: "TOP-RGD", value: "Rose gold" },
        ],
        stores: ["H", "O"],
    },
    {
        slug: "message-plaque",
        name: "Chocolate message plaque",
        category: null,
        price: 99,
        description:
            "A white-chocolate plaque piped with your message (up to 20 characters), to sit on any cake — ours or one from home.",
        ingredients:
            "White chocolate (sugar, cocoa butter, milk solids, soy lecithin), dark chocolate.",
        contains: ["Milk", "Soy"],
        mayContain: ["Nuts"],
        gst: { bps: 1800, code: "1806" },
        returns: null,
        tracked: false,
        stores: ["H", "O"],
    },
];
