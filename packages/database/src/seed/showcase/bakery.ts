import type { Prisma } from "@prisma/client";

import { PLAN } from "../data";
import type { Db } from "../helpers";
import type { BakeryProduct, CategoryKey, StoreKey } from "./bakery-catalogue";
import {
    ALLERGENS,
    CATEGORIES,
    HISTORY_PRODUCTS,
    lineName,
    P,
    PRODUCTS,
    rateOf,
    RYE_KEY,
    ryeId,
    unitPaise,
} from "./bakery-catalogue";
import {
    writeRyeDiscounts,
    writeRyePhotos,
    writeRyeReviews,
} from "./bakery-product-page-write";
import { writeRyeSite } from "./bakery-site";
import type { LineForStock, StockPlan } from "./bakery-stock";
import {
    ensureShelves,
    markSoldOut,
    planStock,
    trackedSince,
    writeCollections,
    writeLevels,
    writeOptions,
    writeVariantsAndListings,
} from "./bakery-stock";
import { SHOWCASE_SEED, TIMEZONE } from "./data";
import { addMinutes, earliest, hashKey, istAt, istWeekday } from "./people";
import type { Period } from "./periods";
import { boundary, periodLabel } from "./periods";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * Rye & Co. (U9, ADR-008): the GST bakery the invoices, orders, subscriptions
 * and customer screens are filmed in. A bakery on Hill Road, Bengaluru —
 * registered for GST in Karnataka (state code 29), numbering its paper
 * RC/26-27/0001 and its credit notes RCCN/26-27/0001. Owned by
 * `demo@saroh.dev`; Nisha, who works the counter, is a Member.
 *
 * STRUCTURE — the business, its GST settings, its two storefronts (Hill
 * Road and Online) and website, its allergen list, categories, the designs'
 * products (`bakery-catalogue.ts`) with their GST rate, HSN/SAC, allergens,
 * variants and shelves (`bakery-stock.ts`), collections, and two Sourdough
 * plans — is upserted on seeded ids.
 *
 * VOLUME — store customers and CRM contacts, orders with their kitchen steps,
 * payments, a line refund and an edit, what they hold and sold, the stock
 * log, subscriptions with their renewals and skips, hand-written trade
 * invoices, identity links and notes — is cleared
 * and written again each run, from a seeded PRNG and dates relative to `now`,
 * so a re-run inside the same half hour writes identical rows.
 *
 * Every invoice is the one the API would have written (`invoices/gst.ts`,
 * `order-invoice.ts`, `order-invoicing.ts`, mirrored below in integer paise):
 *
 * - prices include GST; each line's taxable value and CGST + SGST (same
 *   state) or IGST (another state) are derived from its inclusive amount,
 *   rounded to the paisa, and frozen on the line;
 * - an order's invoice is written when it is paid (online at checkout, or
 *   recorded at the counter), PAID, never due, bill-to from the store
 *   customer and, for a delivery, its address; delivery is a taxed line at
 *   the business's delivery rate (18%, SAC 996813); the place of supply is
 *   the delivery state, else Karnataka. An order never paid has no invoice
 *   and takes no number;
 * - a line refund makes a credit note for that line; an edit before
 *   preparing that adds units makes a supplementary invoice — the original
 *   is never changed;
 * - a subscription renewal is a tax invoice whose line carries no rate:
 *   plans have no GST rate of their own, so the loaf goes out at 0% with no
 *   HSN (bread is nil-rated anyway), exactly as `issueInTx` writes it;
 * - a hand-written trade invoice is taxed at each line's rate, the place of
 *   supply from the café's bill-to state — the Goa café's is IGST;
 * - every number is the next in its series (RC/<FY> for invoices and
 *   supplementary invoices, RCCN/<FY> for credit notes), in the order the
 *   paper was issued, the financial year read in Asia/Kolkata.
 */

const KEY = RYE_KEY;
const sid = ryeId;
const rngFor = (...parts: string[]) =>
    createRng((SHOWCASE_SEED ^ hashKey(KEY, ...parts)) >>> 0);

const NAME = "Rye & Co.";
const DAY = 86_400_000;
const IST = 330 * 60_000;
const CURRENCY = "INR";

export const RYE = {
    key: KEY,
    name: NAME,
    orgId: sid("org"),
    /** Hill Road: the shop, which also delivers. */
    storeId: sid("store"),
    /** Online: the website's shop, delivery only (#526). */
    onlineStoreId: sid("store", "online"),
    slug: "rye-and-co",
    onlineSlug: "rye-and-co-online",
    prefix: sid(""),
};

/** The business's GST standing (BusinessProfile). */
const GST = {
    state: "29",
    pan: "AAGCR4375J",
    prefix: "RC",
    deliveryRateBps: 1800,
    deliverySac: "996813",
};

const MODULES = ["COMMERCE", "PAYMENTS", "CRM"] as const;

// --- GST, as the API computes it (apps/api.saroh.in/src/modules/invoices) ----

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A GSTIN's check character (`gst-states.ts` gstinCheckChar). */
function gstinCheckChar(first14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const product =
            GSTIN_ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
}

/** State code + PAN + entity 1 + Z + its check character. */
export const gstin = (state: string, pan: string) =>
    `${state}${pan}1Z${gstinCheckChar(`${state}${pan}1Z`)}`;

export const RYE_GSTIN = gstin(GST.state, GST.pan);

/**
 * The registered address — the shop on Hill Road the storefront names — and
 * how an invoice prints it (CGST rule 46). Its state is `GST.state`.
 */
export const RYE_ADDRESS = {
    addressLine1: "3 Hill Road",
    addressLine2: "Indiranagar",
    city: "Bengaluru",
    postalCode: "560038",
} as const;
export const RYE_ADDRESS_PRINTED =
    "3 Hill Road, Indiranagar, Bengaluru 560038, Karnataka";

const STATE_CODES: Record<string, string> = {
    Karnataka: "29",
    Goa: "30",
    Telangana: "36",
    Maharashtra: "27",
    "West Bengal": "19",
};

/** "18" → 1800; the rate written back on a line ("0", "5", "18"). */
const bpsToRate = (bps: number) => String(bps / 100);

/** Paise as a Decimal(12,2) string: 48000 → "480.00". */
const rupees = (paise: number) => {
    const sign = paise < 0 ? "-" : "";
    const abs = Math.abs(paise);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

interface DocLineInput {
    description: string;
    quantity: number;
    unitPaise: number;
    /** Null: no rate on the line (a subscription's), 0% on paper. */
    rateBps: number | null;
    code: string | null;
    orderItemId?: string | null;
}

interface DocLine extends DocLineInput {
    amountPaise: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
}

/**
 * One GST-inclusive line → taxable value and tax (`splitInclusive`): the
 * taxable value is rounded to the paisa and the tax is what is left; an odd
 * paisa of intra-state tax goes to CGST.
 */
function taxLine(line: DocLineInput, inter: boolean): DocLine {
    const amountPaise = line.quantity * line.unitPaise;
    const bps = line.rateBps ?? 0;
    const taxablePaise =
        bps <= 0
            ? amountPaise
            : Math.round((amountPaise * 10_000) / (10_000 + bps));
    const tax = amountPaise - taxablePaise;
    const sgst = inter ? 0 : Math.floor(tax / 2);
    return {
        ...line,
        amountPaise,
        taxablePaise,
        cgstPaise: inter ? 0 : tax - sgst,
        sgstPaise: sgst,
        igstPaise: inter ? tax : 0,
    };
}

/** GST inside a set of inclusive lines — `Order.tax` on a registered business. */
const gstInside = (lines: readonly DocLineInput[], inter: boolean) =>
    lines
        .map((l) => taxLine(l, inter))
        .reduce((s, l) => s + l.cgstPaise + l.sgstPaise + l.igstPaise, 0);

// --- Fixtures ----------------------------------------------------------------

/** Delivery, charged per order and taxed at the delivery rate. */
const DELIVERY_PAISE = 6000;

interface Address {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    zip: string;
}

interface Shopper {
    key: string;
    first: string;
    last: string;
    phone: string;
    address: Address;
    /** How often they order, relative to the others. */
    weight: number;
}

const blr = (line1: string, line2: string | null, zip: string): Address => ({
    line1,
    line2,
    city: "Bengaluru",
    state: "Karnataka",
    zip,
});

/** The store's customers (the design's sample, plus a few regulars). */
const SHOPPERS: readonly Shopper[] = [
    {
        key: "priya",
        first: "Priya",
        last: "Raman",
        phone: "+91 98450 11223",
        address: blr("14 Hill Road", "Indiranagar", "560038"),
        weight: 6,
    },
    {
        key: "meera",
        first: "Meera",
        last: "Nair",
        phone: "+91 98860 40211",
        address: blr("88 Queen Street", "Indiranagar", "560038"),
        weight: 4,
    },
    {
        key: "kavya",
        first: "Kavya",
        last: "Iyer",
        phone: "+91 99005 31870",
        address: blr("22 Church Street", null, "560001"),
        weight: 3,
    },
    {
        key: "dev",
        first: "Dev",
        last: "Shah",
        phone: "+91 99000 21876",
        address: blr("7 Ulsoor Road", "Halasuru", "560042"),
        weight: 4,
    },
    {
        key: "arjun",
        first: "Arjun",
        last: "Mehta",
        phone: "+91 98451 77302",
        address: blr("3 Lavelle Road", null, "560001"),
        weight: 3,
    },
    {
        key: "sana",
        first: "Sana",
        last: "Qureshi",
        phone: "+91 97410 55628",
        address: blr("40 MG Road", null, "560001"),
        weight: 2,
    },
    {
        key: "elena",
        first: "Elena",
        last: "Rossi",
        phone: "+91 98220 61447",
        address: {
            line1: "7 Harbour View",
            line2: "Altinho",
            city: "Panaji",
            state: "Goa",
            zip: "403001",
        },
        weight: 0,
    },
    {
        key: "yuki",
        first: "Yuki",
        last: "Tanaka",
        phone: "+91 90000 48213",
        address: {
            line1: "31 Park Row",
            line2: "Jubilee Hills",
            city: "Hyderabad",
            state: "Telangana",
            zip: "500033",
        },
        weight: 0,
    },
    {
        key: "aditya",
        first: "Aditya",
        last: "Shetty",
        phone: "+91 98311 20954",
        address: {
            line1: "5 Fell Road",
            line2: "Salt Lake",
            city: "Kolkata",
            state: "West Bengal",
            zip: "700091",
        },
        weight: 0.4,
    },
    {
        key: "sanjay",
        first: "Sanjay",
        last: "Whitfield",
        phone: "+91 98230 70315",
        address: {
            line1: "2 Beech Court",
            line2: "Koregaon Park",
            city: "Pune",
            state: "Maharashtra",
            zip: "411001",
        },
        weight: 0.4,
    },
    {
        key: "rohan",
        first: "Rohan",
        last: "Das",
        phone: "+91 99160 84422",
        address: blr("11 Brigade Road", null, "560025"),
        weight: 2,
    },
    {
        key: "nikhil",
        first: "Nikhil",
        last: "Rao",
        phone: "+91 98804 12059",
        address: blr("4 Cambridge Road", "Halasuru", "560008"),
        weight: 4,
    },
    {
        key: "tara",
        first: "Tara",
        last: "Pillai",
        phone: "+91 97401 66310",
        address: blr("26 Richmond Road", null, "560025"),
        weight: 3,
    },
    {
        key: "ishaan",
        first: "Ishaan",
        last: "Menon",
        phone: "+91 99720 30481",
        address: blr("9 Promenade Road", "Frazer Town", "560005"),
        weight: 2,
    },
    {
        key: "anjali",
        first: "Anjali",
        last: "Bose",
        phone: "+91 98867 20113",
        address: blr("61 Residency Road", null, "560025"),
        weight: 2,
    },
    {
        key: "vikram",
        first: "Vikram",
        last: "Hegde",
        phone: "+91 90088 14720",
        address: blr("2 Coles Road", "Frazer Town", "560005"),
        weight: 2,
    },
];
const SHOPPER = Object.fromEntries(
    SHOPPERS.map((s, i) => [s.key, i]),
) as Record<string, number>;
const emailOf = (s: { first: string; last: string }) =>
    `${s.first}.${s.last}@example.in`.toLowerCase();

/** Trade cafés Rye supplies, billed by hand. */
const CAFES = [
    {
        key: "kiln",
        first: "Anand",
        last: "Rao",
        company: "Kiln & Co. Café",
        email: "anand@kilnandco.example.in",
        phone: "+91 80 4110 2231",
        pan: "AAKFK8124M",
        state: "29",
        address:
            "Kiln & Co. Café, 12 5th Block, Koramangala, Bengaluru 560095, Karnataka",
    },
    {
        key: "fern",
        first: "Shruti",
        last: "Menon",
        company: "Little Fern Café",
        email: "shruti@littlefern.example.in",
        phone: "+91 80 4092 7710",
        pan: "AAGFL5531Q",
        state: "29",
        address:
            "Little Fern Café, 33 11th Main, Jayanagar 4th Block, Bengaluru 560011, Karnataka",
    },
    {
        key: "brew",
        first: "Vivek",
        last: "Nair",
        company: "Brew Lane",
        email: "vivek@brewlane.example.in",
        phone: "+91 80 4718 3302",
        pan: "ABCFB2207K",
        state: "29",
        address:
            "Brew Lane, 7 27th Main, HSR Layout Sector 1, Bengaluru 560102, Karnataka",
    },
    {
        key: "saltpan",
        first: "Joaquim",
        last: "D'Souza",
        company: "Salt Pan Café",
        email: "joaquim@saltpan.example.in",
        phone: "+91 832 222 4190",
        pan: "AAQFS6618D",
        state: "30",
        address:
            "Salt Pan Café, 18 Rua de Ourém, Fontainhas, Panaji 403001, Goa",
    },
] as const;

/** People on a Sourdough plan who have no store customer. */
const SUBSCRIBERS_ONLY = [
    { key: "lakshmi", first: "Lakshmi", last: "Rao", phone: "+91 98451 30982" },
    { key: "farhan", first: "Farhan", last: "Ali", phone: "+91 99011 62045" },
] as const;

/** The Sourdough plans: weekly, and a month of Saturdays paid at once. */
const PLANS = [
    {
        name: "Sourdough",
        description:
            "A large sourdough loaf every Saturday, collected at Hill Road from 7am.",
        pricePaise: 48_000,
        interval: "WEEK",
    },
    {
        name: "Sourdough, monthly",
        description:
            "Every Saturday's loaf for a month, paid once — four or five collections.",
        pricePaise: 180_000,
        interval: "MONTH",
    },
] as const;

/** Saturday, as `CustomerSubscription.collectionWeekday` (ISO) counts it. */
const SATURDAY_ISO = 6;
/** Saturday, as `istWeekday` (0 = Sunday) counts it. */
const SATURDAY = 6;

// --- Seeding -------------------------------------------------------------------

interface Context {
    prisma: Db;
    now: Date;
    demoUserId: string;
    /** Nisha, who works the counter: a Member. */
    counterUserId: string;
}

export async function seedBakery(
    ctx: Context,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now, demoUserId } = ctx;
    const orgId = RYE.orgId;
    const storeId = RYE.storeId;
    const createdAt = istAt(now, -210, 10 * 60);

    // --- the business, its GST standing, team, modules and plan
    await prisma.organization.upsert({
        where: { slug: RYE.slug },
        update: { name: NAME },
        create: { id: orgId, name: NAME, slug: RYE.slug, createdAt },
    });
    const profile = {
        legalName: "Rye & Co. Bakers LLP",
        country: "India",
        taxId: RYE_GSTIN,
        contactEmail: "hello@ryeandco.example.in",
        timezone: TIMEZONE,
        gstRegistered: true,
        gstState: GST.state,
        ...RYE_ADDRESS,
        invoicePrefix: GST.prefix,
        // The business counts stock (#515); a take that turned it off is undone.
        stockTracking: true,
        deliveryGstRate: bpsToRate(GST.deliveryRateBps),
        deliverySacCode: GST.deliverySac,
    };
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: sid("profile"), organizationId: orgId, ...profile },
    });
    for (const [userId, role, key] of [
        [demoUserId, "OWNER", "demo"],
        [ctx.counterUserId, "MEMBER", "nisha"],
    ] as const) {
        await prisma.membership.upsert({
            where: { organizationId_userId: { organizationId: orgId, userId } },
            update: { role },
            create: {
                id: sid("membership", key),
                organizationId: orgId,
                userId,
                role,
            },
        });
    }
    for (const moduleKey of MODULES) {
        await prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: { organizationId: orgId, moduleKey },
            },
            update: { status: "ENABLED" },
            create: {
                id: sid("module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt: createdAt,
                enabledByUserId: demoUserId,
            },
        });
        const flagKey = `MODULE_${moduleKey}`;
        await prisma.featureFlagOverride.upsert({
            where: {
                flagKey_organizationId: { flagKey, organizationId: orgId },
            },
            update: { enabled: true },
            create: {
                id: sid("flagoverride", moduleKey.toLowerCase()),
                flagKey,
                organizationId: orgId,
                enabled: true,
            },
        });
    }
    const plan = await prisma.plan.findUniqueOrThrow({
        where: { key_version: { key: PLAN.key, version: PLAN.version } },
        select: { id: true },
    });
    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId: plan.id, status: "ACTIVE" },
        create: {
            id: sid("subscription"),
            organizationId: orgId,
            planId: plan.id,
            status: "ACTIVE",
            currentPeriodEnd: istAt(now, 30, 9 * 60),
        },
    });
    await prisma.merchantPaymentProvider.upsert({
        where: {
            organizationId_provider: {
                organizationId: orgId,
                provider: "RAZORPAY",
            },
        },
        update: { status: "CONNECTED" },
        create: {
            id: sid("payments", "razorpay"),
            organizationId: orgId,
            provider: "RAZORPAY",
            status: "CONNECTED",
            // Placeholders: the seed never fabricates a usable credential.
            encryptedCredentials: "seed-not-a-real-credential",
            credentialsIv: "seed-iv",
            credentialsAuthTag: "seed-tag",
        },
    });

    // --- the storefronts: the shop on Hill Road, which also delivers, and
    // the website's Online shop, which only delivers (#526)
    const stores = { H: storeId, O: RYE.onlineStoreId };
    await writeStorefront(prisma, {
        id: storeId,
        key: "",
        orgId,
        slug: RYE.slug,
        name: "Hill Road",
        description: "Sourdough, pastry and coffee, baked on Hill Road.",
        address: "3 Hill Road, Indiranagar, Bengaluru 560038",
        collect: true,
        createdAt,
        demoUserId,
    });
    await writeStorefront(prisma, {
        id: RYE.onlineStoreId,
        key: "online",
        orgId,
        slug: RYE.onlineSlug,
        name: "Online",
        description: "Loaves, beans and gift boxes, delivered.",
        address: null,
        collect: false,
        createdAt: istAt(now, -120, 10 * 60),
        demoUserId,
    });

    // Volume first, so nothing below trips over last run's rows.
    await clearVolume(prisma);

    // --- allergens, categories, options, products
    const allergenId: Record<string, string> = {};
    for (let i = 0; i < ALLERGENS.length; i++) {
        const name = ALLERGENS[i];
        const rowId = sid("allergen", name.toLowerCase());
        await prisma.storeAllergen.upsert({
            where: { id: rowId },
            update: { name, position: i },
            create: {
                id: rowId,
                organizationId: orgId,
                name,
                position: i,
                createdAt,
            },
        });
        allergenId[name] = rowId;
    }
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
    const options = await writeOptions(prisma, orgId);
    const productIds: string[] = [];
    for (let i = 0; i < PRODUCTS.length; i++) {
        const p = PRODUCTS[i];
        const productId = sid("product", i);
        const data = productData(p, {
            categoryId,
            optionId: p.option ? options[p.option].id : null,
            trackedAt: trackedSince(now),
        });
        await prisma.product.upsert({
            where: { id: productId },
            update: data,
            create: {
                id: productId,
                storeId,
                organizationId: orgId,
                slug: p.slug,
                createdAt: istAt(now, -200 + i, 11 * 60),
                ...data,
            },
        });
        productIds.push(productId);
    }
    // Its variants, and where each is sold (#510).
    const variantIds = await writeVariantsAndListings(prisma, {
        orgId,
        stores,
        productIds,
        options,
    });
    // What each product contains or may contain: rewritten whole.
    await prisma.productAllergen.deleteMany({
        where: { productId: { in: productIds } },
    });
    await prisma.productAllergen.createMany({
        data: PRODUCTS.flatMap((p, i) =>
            [
                ...p.contains.map((a) => ({ a, kind: "CONTAINS" })),
                ...p.mayContain.map((a) => ({ a, kind: "MAY_CONTAIN" })),
            ].map(({ a, kind }) => ({
                id: sid("productallergen", i, a.toLowerCase()),
                productId: productIds[i],
                allergenId: allergenId[a],
                organizationId: orgId,
                kind,
            })),
        ),
    });
    await writeCollections(prisma, {
        orgId,
        productIds,
        categoryId,
        createdAt: istAt(now, -30, 11 * 60),
    });
    // The Product Detail and Editor films' photos (#522, #525).
    await writeRyePhotos(prisma, {
        orgId,
        productIds,
        variantIds,
        createdAt: istAt(now, -30, 11 * 60),
    });
    const shelfIds = await ensureShelves(prisma, {
        orgId,
        stores,
        productIds,
        variantIds,
    });

    // --- the Sourdough plans (Restrict from their subscribers: upserted)
    const planIds = PLANS.map((_, i) => sid("plan", i));
    for (let i = 0; i < PLANS.length; i++) {
        const pl = PLANS[i];
        const data = {
            name: pl.name,
            description: pl.description,
            price: rupees(pl.pricePaise),
            currency: CURRENCY,
            interval: pl.interval,
            status: "ACTIVE",
            classesPerMonth: null,
        };
        await prisma.subscriptionPlan.upsert({
            where: { id: planIds[i] },
            update: data,
            create: {
                id: planIds[i],
                organizationId: orgId,
                createdAt,
                updatedAt: createdAt,
                ...data,
            },
        });
    }

    // --- the volume, and what it holds and sold from the shelves
    const world = planWorld({
        now,
        orgId,
        stores,
        demoUserId,
        counterUserId: ctx.counterUserId,
        productIds,
        variantIds,
        shelfIds,
        planIds,
        allergenId,
    });
    await writeLevels(prisma, world.stock.levels);
    await writeWorld(prisma, orgId, world);
    await prisma.stockEntry.createMany({ data: world.stock.entries });
    // Reviews from people who bought the product, and the codes that reach
    // the loaf (#522): after the orders they hang off.
    await writeRyeReviews(prisma, {
        orgId,
        now,
        productIds,
        variantIds,
        demoUserId,
        shopperKey: (email) => SHOPPERS.find((s) => emailOf(s) === email)?.key,
    });
    await writeRyeDiscounts(prisma, { orgId, now, productIds });
    // Sold out by hand this morning, on a loaf that counts no stock.
    await markSoldOut(prisma, {
        orgId,
        stores,
        productIds,
        at: todayClock(now)(10 * 60 + 15),
        by: ctx.counterUserId,
    });
    await writeRyeSite(prisma, { orgId, userId: demoUserId, now });

    return { id: orgId, name: NAME, prefix: RYE.prefix };
}

/** A storefront, its owner, settings and features. */
async function writeStorefront(
    prisma: Db,
    a: {
        id: string;
        /** "" for the first storefront, whose rows predate the second. */
        key: string;
        orgId: string;
        slug: string;
        name: string;
        description: string;
        address: string | null;
        /** Customers can collect here. */
        collect: boolean;
        createdAt: Date;
        demoUserId: string;
    },
) {
    const rowId = (what: string) => (a.key ? sid(what, a.key) : sid(what));
    await prisma.store.upsert({
        where: { slug: a.slug },
        update: { name: a.name, organizationId: a.orgId, deletedAt: null },
        create: {
            id: a.id,
            organizationId: a.orgId,
            name: a.name,
            slug: a.slug,
            description: a.description,
            createdAt: a.createdAt,
        },
    });
    await prisma.storeOwner.upsert({
        where: { storeId_userId: { storeId: a.id, userId: a.demoUserId } },
        update: { role: "OWNER" },
        create: {
            id: rowId("storeowner"),
            storeId: a.id,
            userId: a.demoUserId,
            role: "OWNER",
        },
    });
    const settings = {
        currency: CURRENCY,
        timezone: TIMEZONE,
        kind: "SHOP",
        address: a.address,
        collectionEnabled: a.collect,
        taxEnabled: false,
    };
    await prisma.storeSettings.upsert({
        where: { storeId: a.id },
        update: settings,
        create: { id: rowId("storesettings"), storeId: a.id, ...settings },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId: a.id },
        update: { ecommerceEnabled: true },
        create: {
            id: rowId("storefeatures"),
            storeId: a.id,
            ecommerceEnabled: true,
        },
    });
}

/** A product row's fields, from its catalogue entry. */
function productData(
    p: BakeryProduct,
    a: {
        categoryId: Record<CategoryKey, string>;
        optionId: string | null;
        trackedAt: Date;
    },
) {
    const rate = rateOf(p);
    return {
        name: p.name,
        description: p.description
            ? `<p>${p.description.replace(/&/g, "&amp;")}</p>`
            : null,
        // The details the Product Detail and Editor designs show (#522, #525).
        keyPoints: [...(p.keyPoints ?? [])],
        materials: p.ingredients ?? null,
        howToUse: p.ready ?? null,
        price: rupees(p.price * 100),
        currency: CURRENCY,
        status: p.status ?? "PUBLISHED",
        archivedAt: null,
        categoryId: p.category ? a.categoryId[p.category] : null,
        madeHere: !p.maker,
        maker: p.maker ?? null,
        returnsMode: p.returns === null ? "STOREFRONT" : "OWN",
        returnsText:
            p.returns === null
                ? null
                : (p.returns ?? "Non-returnable — fresh food."),
        gstRate: bpsToRate(rate.bps),
        hsnCode: rate.code,
        optionId: a.optionId,
        // Track stock (#515): on since the log opened, or off.
        stockTracked: p.tracked,
        stockTrackedAt: p.tracked ? a.trackedAt : null,
    };
}

/**
 * This business's volume, children first. Its catalogue and plans stay.
 * Rye is a film set (#526): its whole stock log and every resolved stock
 * check go too, hand-made ones included, so a take that counted, moved or
 * resolved something is undone by the next run.
 */
async function clearVolume(prisma: Db) {
    await prisma.stockCheckResolution.deleteMany({
        where: { organizationId: RYE.orgId },
    });
    await prisma.stockEntry.deleteMany({
        where: { organizationId: RYE.orgId },
    });
    // Every review and invitation, hand-made ones included.
    await prisma.productReview.deleteMany({
        where: { organizationId: RYE.orgId },
    });
    await prisma.reviewInvitation.deleteMany({
        where: { organizationId: RYE.orgId },
    });
    const where = { id: { startsWith: RYE.prefix } };
    // Corrections point at the invoice they correct: remove them first.
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({
        where: { ...where, relatedInvoiceId: { not: null } },
    });
    await prisma.invoice.deleteMany({ where });
    await prisma.paymentRefundLine.deleteMany({ where });
    await prisma.paymentRefund.deleteMany({ where });
    await prisma.paymentAttempt.deleteMany({ where });
    await prisma.paymentIntent.deleteMany({ where });
    await prisma.orderEvent.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.subscriptionSkip.deleteMany({ where });
    await prisma.customerSubscription.deleteMany({ where });
    await prisma.customerIdentityLink.deleteMany({ where });
    await prisma.contactNoteAllergen.deleteMany({
        where: { noteId: { startsWith: RYE.prefix } },
    });
    await prisma.contactNote.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
}

// --- Planning ---------------------------------------------------------------------

type Stage =
    | "NEW"
    | "PREPARING"
    | "READY"
    | "COLLECTED"
    | "HANDED_TO_COURIER"
    | "DELIVERED";

const STATUS_OF: Record<Stage, string> = {
    NEW: "PENDING",
    PREPARING: "PROCESSING",
    READY: "PROCESSING",
    COLLECTED: "DELIVERED",
    HANDED_TO_COURIER: "SHIPPED",
    DELIVERED: "DELIVERED",
};

interface OrderLine {
    product: number;
    qty: number;
    /** Its variant; absent on a product with variants: the first. */
    variant?: number;
}

interface OrderPlan {
    shopper: number;
    placedAt: Date;
    /** The storefront it was placed at; default Hill Road. */
    store?: StoreKey;
    fulfilment: "COLLECT" | "DELIVERY";
    /** Final quantities (after any edit). */
    lines: OrderLine[];
    /** Fulfilled without taking it off the shelf ("Sale not taken", #514). */
    notTaken?: boolean;
    /** ONLINE: paid at checkout; RECORDED: paid at the counter; FAILED: not paid. */
    pay: "ONLINE" | "RECORDED" | "FAILED";
    moves: { to: Stage; at: Date; by: string }[];
    notes?: string;
    trackingUrl?: string;
    /** Units added to a line while it was New, the difference paid online. */
    edit?: { line: number; from: number; at: Date; paidAt: Date; by: string };
    /** Units of one line refunded after it was delivered. */
    refund?: {
        line: number;
        qty: number;
        at: Date;
        by: string;
        reason: string;
    };
}

interface PlanInput {
    now: Date;
    orgId: string;
    stores: Record<StoreKey, string>;
    demoUserId: string;
    counterUserId: string;
    productIds: readonly string[];
    variantIds: readonly string[][];
    shelfIds: Map<string, string>;
    planIds: readonly string[];
    allergenId: Record<string, string>;
}

/** A line's variant index: its own, the first of a product with variants, or none. */
const variantOf = (l: OrderLine): number | null =>
    PRODUCTS[l.product].variants ? (l.variant ?? 0) : null;

/** Local day offset of an instant from `now`'s day, in Kolkata. */
const dayOf = (now: Date, at: Date) =>
    Math.round(
        (istAt(new Date(at.getTime()), 0, 0).getTime() -
            istAt(now, 0, 0).getTime()) /
            DAY,
    );

const hex = (rng: Rng, n: number) =>
    Array.from({ length: n }, () =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789".charAt(
            rng.int(0, 57),
        ),
    ).join("");
const digits = (rng: Rng, n: number) =>
    Array.from({ length: n }, () => rng.int(0, 9)).join("");

/**
 * Today's orders, on a morning clock: planned as minutes of a day that
 * starts at the counter's 06:00 and whose latest step is at 11:40, then laid
 * so that latest step lands twenty minutes before `now` — or, before 11:40,
 * squeezed into the part of today already gone. Either way every order is
 * placed today and every step has already happened.
 */
function todayClock(now: Date): (minute: number) => Date {
    const midnight = istAt(now, 0, 0).getTime();
    const end = 11 * 60 + 40;
    const elapsed = now.getTime() - midnight - 20 * 60_000;
    return (minute: number) =>
        elapsed >= end * 60_000
            ? new Date(now.getTime() - 20 * 60_000 - (end - minute) * 60_000)
            : new Date(midnight + (Math.max(0, elapsed) * minute) / end);
}

function planOrders(input: PlanInput): OrderPlan[] {
    const { now, demoUserId: owner, counterUserId: nisha } = input;
    const rng = rngFor("orders");
    const t = todayClock(now);
    const staff = () => (rng.chance(0.7) ? nisha : owner);

    const collectPath = (placed: Date, by: () => string) => {
        const a = addMinutes(placed, rng.int(10, 50));
        const b = addMinutes(a, rng.int(30, 80));
        const c = addMinutes(b, rng.int(20, 240));
        return [
            { to: "PREPARING" as const, at: a, by: by() },
            { to: "READY" as const, at: b, by: by() },
            { to: "COLLECTED" as const, at: c, by: by() },
        ];
    };
    const deliverPath = (placed: Date, by: () => string) => {
        const a = addMinutes(placed, rng.int(10, 50));
        const b = addMinutes(a, rng.int(30, 80));
        const c = addMinutes(b, rng.int(15, 60));
        const d = addMinutes(c, rng.int(90, 300));
        return [
            { to: "PREPARING" as const, at: a, by: by() },
            { to: "READY" as const, at: b, by: by() },
            { to: "HANDED_TO_COURIER" as const, at: c, by: by() },
            { to: "DELIVERED" as const, at: d, by: by() },
        ];
    };

    const orders: OrderPlan[] = [];

    // History: five weeks of counter and delivery orders, all done.
    const regulars = SHOPPERS.map((s, i) => ({ i, w: s.weight })).filter(
        (x) => x.w > 0,
    );
    const history = PRODUCTS.slice(0, HISTORY_PRODUCTS);
    const breadAndPastry = history
        .map((p, i) => ({ i, p }))
        .filter((x) => x.p.category !== "coffee");
    for (let d = -35; d <= -1; d++) {
        const weekday = istWeekday(now, d);
        const count =
            weekday === SATURDAY
                ? rng.int(3, 4)
                : weekday === 0
                  ? rng.int(0, 1)
                  : rng.int(1, 2);
        for (let k = 0; k < count; k++) {
            const shopper = rng.weighted(regulars, (x) => x.w).i;
            const far = SHOPPERS[shopper].address.state !== "Karnataka";
            const fulfilment = far || rng.chance(0.3) ? "DELIVERY" : "COLLECT";
            const pool =
                fulfilment === "COLLECT"
                    ? history.map((_, i) => i)
                    : breadAndPastry.map((x) => x.i);
            const n = rng.weighted([1, 2, 3], (x) =>
                x === 1 ? 5 : x === 2 ? 3 : 1,
            );
            const picked: number[] = [];
            while (picked.length < n) {
                const p = rng.pick(pool);
                if (!picked.includes(p)) picked.push(p);
            }
            // Placed by two, so even a delivery's last step is the same day.
            const placedAt = istAt(now, d, rng.int(7 * 60, 14 * 60));
            orders.push({
                shopper,
                placedAt,
                fulfilment,
                lines: picked.map((p) => ({
                    product: p,
                    qty:
                        PRODUCTS[p].slug === "cinnamon-bun"
                            ? rng.int(2, 6)
                            : rng.int(1, 2),
                })),
                pay:
                    fulfilment === "DELIVERY" || rng.chance(0.5)
                        ? "ONLINE"
                        : "RECORDED",
                moves:
                    fulfilment === "DELIVERY"
                        ? deliverPath(placedAt, staff)
                        : collectPath(placedAt, staff),
            });
        }
    }

    // Deliveries out of the state: IGST on the order's invoice.
    const elenaAt = istAt(now, -6, 10 * 60 + 12);
    orders.push({
        shopper: SHOPPER.elena,
        placedAt: elenaAt,
        fulfilment: "DELIVERY",
        lines: [
            { product: P["sourdough-loaf"], qty: 1 },
            { product: P["almond-croissant"], qty: 2 },
        ],
        pay: "ONLINE",
        moves: deliverPath(elenaAt, staff),
        notes: "Gift for my sister — please leave with the security desk.",
    });
    const yukiAt = istAt(now, -9, 10 * 60 + 55);
    orders.push({
        shopper: SHOPPER.yuki,
        placedAt: yukiAt,
        fulfilment: "DELIVERY",
        lines: [
            { product: P["rye-caraway-loaf"], qty: 1 },
            { product: P["cinnamon-bun"], qty: 4 },
        ],
        pay: "ONLINE",
        moves: deliverPath(yukiAt, staff),
    });
    // Partly refunded: one almond croissant arrived squashed.
    const sanaAt = istAt(now, -3, 8 * 60 + 40);
    const sanaMoves = deliverPath(sanaAt, staff);
    orders.push({
        shopper: SHOPPER.sana,
        placedAt: sanaAt,
        fulfilment: "DELIVERY",
        lines: [
            { product: P["sourdough-loaf"], qty: 1 },
            { product: P["almond-croissant"], qty: 2 },
        ],
        pay: "ONLINE",
        moves: sanaMoves,
        refund: {
            line: 1,
            qty: 1,
            at: addMinutes(sanaMoves[sanaMoves.length - 1].at, 95),
            by: owner,
            reason: "One almond croissant arrived squashed",
        },
    });

    // The designs' stock story (#526). Buns for Kolkata, three six-packs,
    // still being prepared: Hill Road has one, so it is 2 short.
    const adityaAt = istAt(now, -3, 8 * 60 + 40);
    orders.push({
        shopper: SHOPPER.aditya,
        placedAt: adityaAt,
        fulfilment: "DELIVERY",
        lines: [{ product: P["cinnamon-bun"], variant: 1, qty: 3 }],
        pay: "ONLINE",
        moves: [{ to: "PREPARING", at: addMinutes(adityaAt, 35), by: nisha }],
        notes: "Blue Dart next day, please — they're for my mother.",
    });
    // Yesterday's loaf, collected at the counter without leaving stock.
    const devAt = istAt(now, -1, 7 * 60 + 5);
    orders.push({
        shopper: SHOPPER.dev,
        placedAt: devAt,
        fulfilment: "COLLECT",
        lines: [{ product: P["sourdough-loaf"], qty: 1 }],
        pay: "RECORDED",
        moves: collectPath(devAt, staff),
        notTaken: true,
    });
    // Beans to Pune, sent from Hill Road's shelf.
    const sanjayAt = istAt(now, -1, 13 * 60 + 10);
    orders.push({
        shopper: SHOPPER.sanjay,
        placedAt: sanjayAt,
        fulfilment: "DELIVERY",
        lines: [{ product: P["house-blend-beans-250g"], qty: 2 }],
        pay: "ONLINE",
        moves: deliverPath(sanjayAt, staff),
    });
    // The website's shop: delivered orders from its own shelves.
    const online = (
        shopper: number,
        daysAgo: number,
        minute: number,
        lines: OrderLine[],
    ) => {
        const at = istAt(now, -daysAgo, minute);
        orders.push({
            shopper,
            placedAt: at,
            store: "O",
            fulfilment: "DELIVERY",
            lines,
            pay: "ONLINE",
            moves: deliverPath(at, staff),
        });
    };
    online(SHOPPER.vikram, 4, 10 * 60 + 5, [
        { product: P["sourdough-loaf"], variant: 1, qty: 2 },
    ]);
    online(SHOPPER.anjali, 2, 11 * 60 + 30, [
        { product: P["house-blend-beans-250g"], qty: 1 },
    ]);
    online(SHOPPER.ishaan, 1, 9 * 60 + 15, [
        { product: P["bakers-gift-box"], qty: 1 },
    ]);

    // Today, one board: every kitchen stage.
    const today = (
        placedMinute: number,
        plan: Omit<OrderPlan, "placedAt" | "moves">,
        moves: [Stage, number, string][],
    ): OrderPlan => ({
        ...plan,
        placedAt: t(placedMinute),
        moves: moves.map(([to, minute, by]) => ({ to, at: t(minute), by })),
    });
    const hhmm = (h: number, m: number) => h * 60 + m;
    orders.push(
        // Collected already.
        today(
            hhmm(6, 50),
            {
                shopper: SHOPPER.nikhil,
                fulfilment: "COLLECT",
                lines: [
                    { product: P["flat-white"], qty: 2 },
                    { product: P["butter-croissant"], qty: 2 },
                ],
                pay: "RECORDED",
            },
            [
                ["PREPARING", hhmm(6, 52), nisha],
                ["READY", hhmm(7, 5), nisha],
                ["COLLECTED", hhmm(7, 9), nisha],
            ],
        ),
        today(
            hhmm(6, 58),
            {
                shopper: SHOPPER.tara,
                fulfilment: "COLLECT",
                lines: [{ product: P["seeded-multigrain-loaf"], qty: 1 }],
                pay: "ONLINE",
            },
            [
                ["PREPARING", hhmm(7, 20), nisha],
                ["READY", hhmm(8, 5), nisha],
                ["COLLECTED", hhmm(9, 40), owner],
            ],
        ),
        // On its way, with a tracking link.
        today(
            hhmm(6, 10),
            {
                shopper: SHOPPER.ishaan,
                fulfilment: "DELIVERY",
                lines: [
                    { product: P["sourdough-loaf"], qty: 1 },
                    { product: P["cinnamon-bun"], qty: 4 },
                ],
                pay: "ONLINE",
                trackingUrl: "https://track.example.in/delivery/RC4402518736",
            },
            [
                ["PREPARING", hhmm(7, 0), nisha],
                ["READY", hhmm(9, 10), nisha],
                ["HANDED_TO_COURIER", hhmm(11, 40), owner],
            ],
        ),
        // Ready on the shelf.
        today(
            hhmm(7, 35),
            {
                shopper: SHOPPER.dev,
                fulfilment: "COLLECT",
                lines: [
                    { product: P["seeded-multigrain-loaf"], qty: 1 },
                    { product: P.cappuccino, qty: 1 },
                ],
                pay: "RECORDED",
            },
            [
                ["PREPARING", hhmm(7, 40), nisha],
                ["READY", hhmm(8, 0), nisha],
            ],
        ),
        today(
            hhmm(8, 20),
            {
                shopper: SHOPPER.sana,
                fulfilment: "COLLECT",
                lines: [
                    { product: P.baguette, qty: 2 },
                    { product: P["cold-brew"], qty: 1 },
                ],
                pay: "ONLINE",
                notes: "Picking up on the way to work, around 11.",
            },
            [
                ["PREPARING", hhmm(9, 5), nisha],
                ["READY", hhmm(10, 50), nisha],
            ],
        ),
        // Preparing: a delivery, and one edited while it was new.
        today(
            hhmm(6, 10) + 5,
            {
                shopper: SHOPPER.arjun,
                fulfilment: "DELIVERY",
                lines: [{ product: P["cinnamon-bun"], qty: 3 }],
                pay: "ONLINE",
            },
            [["PREPARING", hhmm(10, 20), nisha]],
        ),
        {
            ...today(
                hhmm(8, 45),
                {
                    shopper: SHOPPER.meera,
                    fulfilment: "COLLECT",
                    lines: [
                        { product: P["sourdough-loaf"], qty: 1 },
                        { product: P["butter-croissant"], qty: 3 },
                    ],
                    pay: "ONLINE",
                },
                [["PREPARING", hhmm(10, 35), nisha]],
            ),
            edit: {
                line: 1,
                from: 1,
                at: t(hhmm(9, 30)),
                paidAt: t(hhmm(9, 34)),
                by: owner,
            },
        },
        // New: the allergy case, a delivery, and one whose payment failed.
        today(
            hhmm(9, 14),
            {
                shopper: SHOPPER.priya,
                fulfilment: "COLLECT",
                lines: [
                    { product: P["sourdough-loaf"], qty: 2 },
                    { product: P["almond-croissant"], qty: 1 },
                ],
                pay: "ONLINE",
                notes: "Collecting after work, around six.",
            },
            [],
        ),
        today(
            hhmm(10, 48),
            {
                shopper: SHOPPER.kavya,
                fulfilment: "DELIVERY",
                lines: [{ product: P["sourdough-loaf"], qty: 1 }],
                pay: "ONLINE",
            },
            [],
        ),
        today(
            hhmm(11, 5),
            {
                shopper: SHOPPER.anjali,
                fulfilment: "COLLECT",
                lines: [
                    { product: P["pain-au-chocolat"], qty: 2 },
                    { product: P["flat-white"], qty: 2 },
                ],
                pay: "FAILED",
            },
            [],
        ),
        // Online, today: a small loaf just in, and beans being packed.
        today(
            hhmm(9, 50),
            {
                shopper: SHOPPER.tara,
                store: "O",
                fulfilment: "DELIVERY",
                lines: [{ product: P["sourdough-loaf"], variant: 1, qty: 1 }],
                pay: "ONLINE",
            },
            [],
        ),
        today(
            hhmm(8, 5),
            {
                shopper: SHOPPER.nikhil,
                store: "O",
                fulfilment: "DELIVERY",
                lines: [
                    {
                        product: P["house-blend-beans-250g"],
                        variant: 1,
                        qty: 1,
                    },
                ],
                pay: "ONLINE",
            },
            [["PREPARING", hhmm(9, 0), nisha]],
        ),
    );
    return orders.sort(
        (a, b) =>
            a.placedAt.getTime() - b.placedAt.getTime() ||
            a.shopper - b.shopper,
    );
}

/** A document before it is numbered. */
interface DocSpec {
    id: string;
    kind: "INVOICE" | "CREDIT_NOTE" | "SUPPLEMENTARY";
    status: "DRAFT" | "ISSUED" | "PAID";
    source: "ORDER" | "SUBSCRIPTION" | "MANUAL";
    createdAt: Date;
    issuedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNote: string | null;
    orderId?: string;
    contactId?: string;
    subscriptionId?: string;
    period?: Period;
    relatedInvoiceId?: string;
    paymentRefundId?: string;
    billTo: {
        name: string;
        email: string;
        gstin: string | null;
        /** A GST state code. */
        state: string | null;
        address: string | null;
    };
    placeOfSupply: string;
    lines: DocLineInput[];
    createdByUserId: string | null;
}

interface World {
    customers: Prisma.CustomerCreateManyInput[];
    contacts: Prisma.ContactCreateManyInput[];
    orders: Prisma.OrderCreateManyInput[];
    items: Prisma.OrderItemCreateManyInput[];
    events: Prisma.OrderEventCreateManyInput[];
    intents: Prisma.PaymentIntentCreateManyInput[];
    attempts: Prisma.PaymentAttemptCreateManyInput[];
    refunds: Prisma.PaymentRefundCreateManyInput[];
    refundLines: Prisma.PaymentRefundLineCreateManyInput[];
    subscriptions: Prisma.CustomerSubscriptionCreateManyInput[];
    skips: Prisma.SubscriptionSkipCreateManyInput[];
    links: Prisma.CustomerIdentityLinkCreateManyInput[];
    notes: Prisma.ContactNoteCreateManyInput[];
    noteAllergens: Prisma.ContactNoteAllergenCreateManyInput[];
    docs: DocSpec[];
    /** What the lines hold and sold, the shelves' numbers and the stock log. */
    stock: StockPlan;
}

const METHODS = [
    { method: "UPI", weight: 60 },
    { method: "CASH", weight: 25 },
    { method: "CARD", weight: 15 },
] as const;

function counterPayment(rng: Rng): {
    method: string;
    reference: string | null;
} {
    const { method } = rng.weighted(METHODS, (m) => m.weight);
    return {
        method,
        reference:
            method === "UPI"
                ? `UPI ref ${rng.int(3, 6)}${digits(rng, 11)}`
                : method === "CARD"
                  ? `Card ending ${digits(rng, 4)}`
                  : null,
    };
}

function planWorld(input: PlanInput): World {
    const { now, orgId, demoUserId: owner } = input;
    const storeId = input.stores.H;
    const w: Omit<World, "stock"> = {
        customers: [],
        contacts: [],
        orders: [],
        items: [],
        events: [],
        intents: [],
        attempts: [],
        refunds: [],
        refundLines: [],
        subscriptions: [],
        skips: [],
        links: [],
        notes: [],
        noteAllergens: [],
        docs: [],
    };
    // A customer belongs to a storefront: Online's are their own rows.
    const customerId = (i: number, store: StoreKey = "H") =>
        store === "H"
            ? sid("customer", SHOPPERS[i].key)
            : sid("customer", SHOPPERS[i].key, "online");
    const stockLines: LineForStock[] = [];
    const contactId = (key: string) => sid("contact", key);

    // --- orders, their steps, their money and their paper
    const planned = planOrders(input);
    const payRng = rngFor("payments");
    const firstOrder = new Map<number, Date>();
    const firstOnline = new Map<number, Date>();
    planned.forEach((o, n) => {
        const orderId = sid("order", n);
        const number = String(1001 + n);
        const shopper = SHOPPERS[o.shopper];
        const store = o.store ?? "H";
        const firsts = store === "H" ? firstOrder : firstOnline;
        if (!firsts.has(o.shopper)) firsts.set(o.shopper, o.placedAt);
        const delivery = o.fulfilment === "DELIVERY";
        const shippingPaise = delivery ? DELIVERY_PAISE : 0;
        const inter = delivery && shopper.address.state !== "Karnataka";
        const pos = delivery ? STATE_CODES[shopper.address.state] : GST.state;

        const itemIds = o.lines.map((_, k) => sid("orderitem", n, k));
        const priceOf = (l: OrderLine) => unitPaise(l.product, variantOf(l));
        const lineInputs = (qty: (k: number) => number): DocLineInput[] => [
            ...o.lines.map((l, k) => ({
                description: lineName(l.product, variantOf(l)),
                quantity: qty(k),
                unitPaise: priceOf(l),
                rateBps: rateOf(PRODUCTS[l.product]).bps,
                code: rateOf(PRODUCTS[l.product]).code,
                orderItemId: itemIds[k],
            })),
            ...(shippingPaise > 0
                ? [
                      {
                          description: "Delivery",
                          quantity: 1,
                          unitPaise: shippingPaise,
                          rateBps: GST.deliveryRateBps,
                          code: GST.deliverySac,
                      },
                  ]
                : []),
        ];
        const finalLines = lineInputs((k) => o.lines[k].qty);
        const placedLines = lineInputs((k) =>
            o.edit?.line === k ? o.edit.from : o.lines[k].qty,
        );
        const subtotalPaise = o.lines.reduce(
            (s, l) => s + l.qty * priceOf(l),
            0,
        );
        const totalPaise = subtotalPaise + shippingPaise;
        const placedTotal = placedLines.reduce(
            (s, l) => s + l.quantity * l.unitPaise,
            0,
        );

        const last = o.moves[o.moves.length - 1] as
            OrderPlan["moves"][number] | undefined;
        const stage: Stage = last?.to ?? "NEW";
        const lastTouch = [
            o.placedAt,
            ...o.moves.map((m) => m.at),
            ...(o.edit ? [o.edit.paidAt] : []),
            ...(o.refund ? [o.refund.at] : []),
        ].reduce((a, b) => (b > a ? b : a));

        w.orders.push({
            id: orderId,
            storeId: input.stores[store],
            organizationId: orgId,
            orderId: number,
            customerId: customerId(o.shopper, store),
            subtotal: rupees(subtotalPaise),
            tax: rupees(gstInside(finalLines, inter)),
            shipping: rupees(shippingPaise),
            discount: "0.00",
            total: rupees(totalPaise),
            currency: CURRENCY,
            status: STATUS_OF[stage],
            paymentStatus: o.pay === "FAILED" ? "FAILED" : "PAID",
            stage,
            fulfilment: o.fulfilment,
            deliveryName: delivery ? `${shopper.first} ${shopper.last}` : null,
            deliveryPhone: delivery ? shopper.phone : null,
            deliveryLine1: delivery ? shopper.address.line1 : null,
            deliveryLine2: delivery ? shopper.address.line2 : null,
            deliveryCity: delivery ? shopper.address.city : null,
            deliveryState: delivery ? shopper.address.state : null,
            deliveryPostalCode: delivery ? shopper.address.zip : null,
            notes: o.notes ?? null,
            trackingUrl: o.trackingUrl ?? null,
            createdAt: o.placedAt,
            updatedAt: lastTouch,
        });
        // Where it left the shelf: collected, or handed to the courier.
        const out = o.moves.find(
            (m) => m.to === "COLLECTED" || m.to === "HANDED_TO_COURIER",
        );
        const open =
            STATUS_OF[stage] === "PENDING" || STATUS_OF[stage] === "PROCESSING";
        o.lines.forEach((l, k) => {
            const variant = variantOf(l);
            w.items.push({
                id: itemIds[k],
                orderId,
                productId: input.productIds[l.product],
                variantId:
                    variant === null
                        ? null
                        : input.variantIds[l.product][variant],
                quantity: l.qty,
                price: rupees(priceOf(l)),
                // What it holds or sold is set from the shelves below.
                stockRow: "NONE",
            });
            stockLines.push({
                itemId: itemIds[k],
                orderId,
                product: l.product,
                variant,
                qty: l.qty,
                store,
                open,
                fulfilledAt: out?.at ?? null,
                fulfilledBy: out?.by ?? null,
                notTaken: o.notTaken,
            });
        });

        // The kitchen's steps, and the edit made while it was new.
        let stepAt: Stage = "NEW";
        const steps: Prisma.OrderEventCreateManyInput[] = [];
        if (o.edit) {
            const line = o.lines[o.edit.line];
            steps.push({
                id: sid("orderevent", n, "edit"),
                organizationId: orgId,
                orderId,
                kind: "EDIT",
                actorUserId: o.edit.by,
                fromStage: "NEW",
                toStage: "NEW",
                note: `${lineName(line.product, variantOf(line))} ${o.edit.from} → ${line.qty}`,
                amountCents: (line.qty - o.edit.from) * priceOf(line),
                createdAt: o.edit.at,
            });
        }
        o.moves.forEach((m, k) => {
            steps.push({
                id: sid("orderevent", n, k),
                organizationId: orgId,
                orderId,
                kind: "STAGE",
                actorUserId: m.by,
                fromStage: stepAt,
                toStage: m.to,
                fromStatus: STATUS_OF[stepAt],
                toStatus: STATUS_OF[m.to],
                note: null,
                createdAt: m.at,
            });
            stepAt = m.to;
        });

        // The money: online on a Razorpay intent; at the counter, recorded.
        const intentId = sid("intent", n);
        const paymentRef = `pay_${hex(payRng, 14)}`;
        if (o.pay !== "RECORDED") {
            const failed = o.pay === "FAILED";
            w.intents.push({
                id: intentId,
                organizationId: orgId,
                orderId,
                provider: "RAZORPAY",
                providerIntentId: `order_${hex(payRng, 14)}`,
                amountCents: placedTotal,
                currency: CURRENCY,
                status: failed ? "FAILED" : "SUCCEEDED",
                createdAt: o.placedAt,
                updatedAt: addMinutes(o.placedAt, 1),
            });
            w.attempts.push({
                id: sid("attempt", n),
                organizationId: orgId,
                paymentIntentId: intentId,
                provider: "RAZORPAY",
                providerRef: paymentRef,
                status: failed ? "FAILED" : "CAPTURED",
                rawResponse: failed
                    ? { error: "BAD_REQUEST_ERROR", reason: "payment_failed" }
                    : undefined,
                createdAt: addMinutes(o.placedAt, 1),
            });
        }
        if (o.pay === "FAILED") {
            w.events.push(...steps);
            return;
        }

        // The order's invoice: written when it was paid, as it was placed.
        const paidAt =
            o.pay === "ONLINE" ? addMinutes(o.placedAt, 1) : o.placedAt;
        const invoiceId = sid("invoice", "order", n);
        const billTo = {
            name: `${shopper.first} ${shopper.last}`,
            email: emailOf(shopper),
            gstin: null,
            state: null,
            address: delivery
                ? [
                      `${shopper.first} ${shopper.last}`,
                      shopper.address.line1,
                      shopper.address.line2,
                      `${shopper.address.city} ${shopper.address.zip}`,
                      shopper.address.state,
                  ]
                      .filter((x) => x && x.trim() !== "")
                      .join(", ")
                : null,
        };
        w.docs.push({
            id: invoiceId,
            kind: "INVOICE",
            status: "PAID",
            source: "ORDER",
            createdAt: paidAt,
            issuedAt: paidAt,
            dueAt: null,
            paidAt,
            paymentMethod: o.pay === "ONLINE" ? "ONLINE" : "RECORDED",
            paymentReference: o.pay === "ONLINE" ? paymentRef : null,
            paymentNote: `Paid on order ${number}`,
            orderId,
            billTo,
            placeOfSupply: pos,
            lines: placedLines,
            createdByUserId: null,
        });

        // An edit before preparing: the difference paid on a second intent,
        // the added units on a supplementary invoice.
        if (o.edit) {
            const line = o.lines[o.edit.line];
            const added = line.qty - o.edit.from;
            const diffIntent = sid("intent", n, "edit");
            w.intents.push({
                id: diffIntent,
                organizationId: orgId,
                orderId,
                provider: "RAZORPAY",
                providerIntentId: `order_${hex(payRng, 14)}`,
                amountCents: added * priceOf(line),
                currency: CURRENCY,
                status: "SUCCEEDED",
                idempotencyKey: `order-edit:${sid("orderevent", n, "edit")}`,
                createdAt: o.edit.at,
                updatedAt: o.edit.paidAt,
            });
            w.attempts.push({
                id: sid("attempt", n, "edit"),
                organizationId: orgId,
                paymentIntentId: diffIntent,
                provider: "RAZORPAY",
                providerRef: `pay_${hex(payRng, 14)}`,
                status: "CAPTURED",
                createdAt: o.edit.paidAt,
            });
            w.docs.push({
                id: sid("invoice", "order", n, "supplementary"),
                kind: "SUPPLEMENTARY",
                status: "PAID",
                source: "ORDER",
                createdAt: o.edit.at,
                issuedAt: o.edit.at,
                dueAt: null,
                paidAt: o.edit.paidAt,
                paymentMethod: "ORDER",
                paymentReference: null,
                paymentNote: steps[0].note ?? null,
                orderId,
                relatedInvoiceId: invoiceId,
                billTo,
                placeOfSupply: pos,
                lines: [
                    {
                        description: lineName(line.product, variantOf(line)),
                        quantity: added,
                        unitPaise: priceOf(line),
                        rateBps: rateOf(PRODUCTS[line.product]).bps,
                        code: rateOf(PRODUCTS[line.product]).code,
                        orderItemId: itemIds[o.edit.line],
                    },
                ],
                createdByUserId: o.edit.by,
            });
        }

        // A line refund: the refund, the lines it covers, a step on the
        // timeline and a credit note for that line.
        if (o.refund) {
            const line = o.lines[o.refund.line];
            const amount = o.refund.qty * priceOf(line);
            const refundId = sid("refund", n);
            w.refunds.push({
                id: refundId,
                organizationId: orgId,
                paymentIntentId: intentId,
                amountCents: amount,
                currency: CURRENCY,
                status: "SUCCEEDED",
                providerRefundId: `rfnd_${hex(payRng, 14)}`,
                reason: o.refund.reason,
                idempotencyKey: `seed-refund-${n}`,
                createdAt: o.refund.at,
                updatedAt: addMinutes(o.refund.at, 2),
            });
            w.refundLines.push({
                id: sid("refundline", n, 0),
                organizationId: orgId,
                paymentRefundId: refundId,
                orderItemId: itemIds[o.refund.line],
                quantity: o.refund.qty,
                amountCents: amount,
                createdAt: o.refund.at,
            });
            steps.push({
                id: sid("orderevent", n, "refund"),
                organizationId: orgId,
                orderId,
                kind: "REFUND",
                actorUserId: o.refund.by,
                note: o.refund.reason,
                amountCents: amount,
                createdAt: o.refund.at,
            });
            w.docs.push({
                id: sid("invoice", "order", n, "credit"),
                kind: "CREDIT_NOTE",
                status: "ISSUED",
                source: "ORDER",
                createdAt: addMinutes(o.refund.at, 2),
                issuedAt: addMinutes(o.refund.at, 2),
                dueAt: null,
                paidAt: null,
                paymentMethod: null,
                paymentReference: null,
                paymentNote: o.refund.reason,
                orderId,
                relatedInvoiceId: invoiceId,
                paymentRefundId: refundId,
                billTo,
                placeOfSupply: pos,
                lines: [
                    {
                        description: lineName(line.product, variantOf(line)),
                        quantity: o.refund.qty,
                        unitPaise: priceOf(line),
                        rateBps: rateOf(PRODUCTS[line.product]).bps,
                        code: rateOf(PRODUCTS[line.product]).code,
                        orderItemId: itemIds[o.refund.line],
                    },
                ],
                createdByUserId: null,
            });
        }
        w.events.push(...steps);
    });

    // --- store customers: exist a while before their first order
    const peopleRng = rngFor("people");
    SHOPPERS.forEach((s, i) => {
        const first = firstOrder.get(i);
        const at = first
            ? addMinutes(first, -peopleRng.int(60, 20 * 24 * 60))
            : istAt(now, -peopleRng.int(10, 60), 11 * 60);
        w.customers.push({
            id: customerId(i),
            storeId,
            organizationId: orgId,
            email: emailOf(s),
            firstName: s.first,
            lastName: s.last,
            phone: s.phone,
            country: "India",
            state: s.address.state,
            city: s.address.city,
            zipCode: s.address.zip,
            createdAt: at,
            updatedAt: at,
        });
    });
    // Online's customers: the people who have ordered there.
    SHOPPERS.forEach((s, i) => {
        const first = firstOnline.get(i);
        if (!first) return;
        const at = addMinutes(first, -peopleRng.int(5, 3 * 24 * 60));
        w.customers.push({
            id: customerId(i, "O"),
            storeId: input.stores.O,
            organizationId: orgId,
            email: emailOf(s),
            firstName: s.first,
            lastName: s.last,
            phone: s.phone,
            country: "India",
            state: s.address.state,
            city: s.address.city,
            zipCode: s.address.zip,
            createdAt: at,
            updatedAt: at,
        });
    });

    // --- the Sourdough subscribers
    const subRng = rngFor("subscriptions");
    const subscribers: {
        key: string;
        shopper: number | null;
        plan: 0 | 1;
        daysAgo: number;
        state: "ACTIVE" | "PAUSED" | "FAILED" | "CHANGING";
        skip?: number[];
    }[] = [
        {
            key: "priya",
            shopper: SHOPPER.priya,
            plan: 0,
            daysAgo: 61,
            state: "ACTIVE",
        },
        {
            key: "meera",
            shopper: SHOPPER.meera,
            plan: 0,
            daysAgo: 45,
            state: "ACTIVE",
            skip: [0],
        },
        {
            key: "dev",
            shopper: SHOPPER.dev,
            plan: 0,
            daysAgo: 88,
            state: "CHANGING",
        },
        {
            key: "arjun",
            shopper: SHOPPER.arjun,
            plan: 1,
            daysAgo: 42,
            state: "FAILED",
        },
        {
            key: "kavya",
            shopper: SHOPPER.kavya,
            plan: 0,
            daysAgo: 50,
            state: "PAUSED",
        },
        {
            key: "sana",
            shopper: SHOPPER.sana,
            plan: 1,
            daysAgo: 72,
            state: "ACTIVE",
            skip: [1],
        },
        {
            key: "lakshmi",
            shopper: null,
            plan: 0,
            daysAgo: 20,
            state: "ACTIVE",
            skip: [0],
        },
        {
            key: "farhan",
            shopper: null,
            plan: 1,
            daysAgo: 103,
            state: "ACTIVE",
        },
    ];
    const nextSaturdays = (() => {
        const out: number[] = [];
        for (let d = 1; out.length < 3; d++) {
            if (istWeekday(now, d) === SATURDAY) out.push(d);
        }
        return out;
    })();
    /** The first Saturday morning after `at`, when the loaf is collected and paid. */
    const collectedAfter = (at: Date) => {
        const base = dayOf(now, at);
        for (let d = 0; d <= 7; d++) {
            if (istWeekday(now, base + d) !== SATURDAY) continue;
            const when = istAt(now, base + d, 7 * 60 + 30 + subRng.int(0, 60));
            if (when > at) return when;
        }
        return istAt(now, base + 7, 8 * 60);
    };
    const firstSeen = new Map<string, Date>();
    subscribers.forEach((s) => {
        const plan = PLANS[s.plan];
        const interval = plan.interval;
        const anchor = istAt(now, -s.daysAgo, 0);
        const subscribedAt = istAt(
            now,
            -s.daysAgo,
            subRng.int(9 * 60, 12 * 60),
        );
        const at = (k: number) => boundary(anchor, interval, TIMEZONE, k);
        const pausedAt =
            s.state === "PAUSED" ? istAt(now, -5, 11 * 60 + 20) : null;
        const until = pausedAt ?? now;
        let n = 0;
        while (at(n + 1) <= until) n += 1;
        const subId = sid("sub", s.key);
        const contact = contactId(s.key);
        const person =
            s.shopper !== null
                ? SHOPPERS[s.shopper]
                : SUBSCRIBERS_ONLY.find((x) => x.key === s.key);
        if (!person) throw new Error(`No person for subscriber ${s.key}`);
        firstSeen.set(s.key, subscribedAt);
        let lastTouch = subscribedAt;
        for (let k = 0; k <= n; k++) {
            const period = { start: at(k), end: at(k + 1) };
            const issuedAt =
                k === 0
                    ? subscribedAt
                    : earliest(
                          addMinutes(period.start, subRng.int(1, 55)),
                          now,
                      );
            const failed = s.state === "FAILED" && k === n;
            const collected = collectedAfter(issuedAt);
            const paid =
                !failed && collected <= addMinutes(now, -5)
                    ? { at: collected, ...counterPayment(subRng) }
                    : null;
            lastTouch =
                paid && paid.at > lastTouch
                    ? paid.at
                    : issuedAt > lastTouch
                      ? issuedAt
                      : lastTouch;
            w.docs.push({
                id: sid("invoice", "sub", s.key, k),
                kind: "INVOICE",
                status: paid ? "PAID" : "ISSUED",
                source: "SUBSCRIPTION",
                createdAt: issuedAt,
                issuedAt,
                dueAt: new Date(issuedAt.getTime() + 7 * DAY),
                paidAt: paid?.at ?? null,
                paymentMethod: paid?.method ?? null,
                paymentReference: paid?.reference ?? null,
                paymentNote: null,
                contactId: contact,
                subscriptionId: subId,
                period,
                billTo: {
                    name: `${person.first} ${person.last}`,
                    email: emailOf(person),
                    gstin: null,
                    state: null,
                    address: null,
                },
                placeOfSupply: GST.state,
                lines: [
                    {
                        description: `${plan.name} · ${periodLabel(period, TIMEZONE)}`,
                        quantity: 1,
                        unitPaise: plan.pricePaise,
                        rateBps: null,
                        code: null,
                    },
                ],
                createdByUserId: k === 0 ? owner : null,
            });
        }
        w.subscriptions.push({
            id: subId,
            organizationId: orgId,
            planId: input.planIds[s.plan],
            contactId: contact,
            status: s.state === "PAUSED" ? "PAUSED" : "ACTIVE",
            price: rupees(plan.pricePaise),
            currency: CURRENCY,
            interval,
            timezone: TIMEZONE,
            anchorAt: anchor,
            currentPeriodStart: at(n),
            currentPeriodEnd: at(n + 1),
            pausedAt,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            createdByUserId: owner,
            collectionWeekday: SATURDAY_ISO,
            collectionNote: "One large sourdough loaf",
            pendingPlanId: s.state === "CHANGING" ? input.planIds[1] : null,
            createdAt: subscribedAt,
            updatedAt: pausedAt && pausedAt > lastTouch ? pausedAt : lastTouch,
        });
        for (const k of s.skip ?? []) {
            const d = nextSaturdays[k];
            const local = new Date(istAt(now, d, 12 * 60).getTime() + IST);
            const skippedAt = istAt(
                now,
                -subRng.int(0, 2),
                subRng.int(8 * 60, 20 * 60),
            );
            w.skips.push({
                id: sid("skip", s.key, k),
                organizationId: orgId,
                subscriptionId: subId,
                date: new Date(
                    Date.UTC(
                        local.getUTCFullYear(),
                        local.getUTCMonth(),
                        local.getUTCDate(),
                    ),
                ),
                createdByUserId: owner,
                createdAt: earliest(skippedAt, addMinutes(now, -30)),
            });
        }
    });

    // --- hand-written trade invoices
    const tradeRng = rngFor("trade");
    const cafe = (key: string) => {
        const c = CAFES.find((x) => x.key === key);
        if (!c) throw new Error(`No café ${key}`);
        return c;
    };
    const tradeLine = (
        slug: string,
        qty: number,
        unit: number,
    ): DocLineInput => {
        const p = PRODUCTS[P[slug]];
        return {
            description: `${p.name} (trade)`,
            quantity: qty,
            unitPaise: unit * 100,
            rateBps: rateOf(p).bps,
            code: rateOf(p).code,
        };
    };
    const trade: {
        cafe: string;
        issuedDaysAgo: number | null;
        createdDaysAgo: number;
        paidDaysAgo?: number;
        method?: string;
        lines: DocLineInput[];
    }[] = [
        {
            cafe: "kiln",
            createdDaysAgo: 38,
            issuedDaysAgo: 38,
            paidDaysAgo: 30,
            method: "BANK_TRANSFER",
            lines: [
                tradeLine("sourdough-loaf", 20, 400),
                tradeLine("butter-croissant", 40, 150),
            ],
        },
        {
            cafe: "fern",
            createdDaysAgo: 27,
            issuedDaysAgo: 27,
            paidDaysAgo: 19,
            method: "UPI",
            lines: [
                tradeLine("baguette", 30, 130),
                tradeLine("cinnamon-bun", 24, 100),
            ],
        },
        {
            // Overdue: due ten days after it went out, and not paid.
            cafe: "fern",
            createdDaysAgo: 21,
            issuedDaysAgo: 21,
            lines: [
                tradeLine("seeded-multigrain-loaf", 15, 350),
                tradeLine("almond-croissant", 20, 300),
            ],
        },
        {
            cafe: "kiln",
            createdDaysAgo: 10,
            issuedDaysAgo: 10,
            paidDaysAgo: 4,
            method: "BANK_TRANSFER",
            lines: [
                tradeLine("sourdough-loaf", 20, 400),
                tradeLine("pain-au-chocolat", 30, 180),
            ],
        },
        {
            // To Goa: IGST.
            cafe: "saltpan",
            createdDaysAgo: 8,
            issuedDaysAgo: 8,
            paidDaysAgo: 2,
            method: "BANK_TRANSFER",
            lines: [
                tradeLine("sourdough-loaf", 30, 400),
                tradeLine("almond-croissant", 24, 300),
                {
                    description: "Delivery to Panaji, chilled van",
                    quantity: 1,
                    unitPaise: 150_000,
                    rateBps: GST.deliveryRateBps,
                    code: GST.deliverySac,
                },
            ],
        },
        {
            // Due: out this week.
            cafe: "brew",
            createdDaysAgo: 4,
            issuedDaysAgo: 4,
            lines: [
                tradeLine("sourdough-loaf", 12, 400),
                tradeLine("butter-croissant", 24, 150),
            ],
        },
        {
            // A draft for next week's standing order.
            cafe: "brew",
            createdDaysAgo: 1,
            issuedDaysAgo: null,
            lines: [
                tradeLine("rye-caraway-loaf", 10, 450),
                tradeLine("cinnamon-bun", 30, 100),
            ],
        },
    ];
    trade.forEach((t, k) => {
        const c = cafe(t.cafe);
        const createdAt = istAt(
            now,
            -t.createdDaysAgo,
            tradeRng.int(10 * 60, 12 * 60),
        );
        const issuedAt =
            t.issuedDaysAgo === null
                ? null
                : addMinutes(createdAt, tradeRng.int(5, 40));
        const paidAt =
            issuedAt && t.paidDaysAgo !== undefined
                ? istAt(now, -t.paidDaysAgo, tradeRng.int(11 * 60, 17 * 60))
                : null;
        w.docs.push({
            id: sid("invoice", "trade", k),
            kind: "INVOICE",
            status: !issuedAt ? "DRAFT" : paidAt ? "PAID" : "ISSUED",
            source: "MANUAL",
            createdAt,
            issuedAt,
            dueAt: issuedAt ? new Date(issuedAt.getTime() + 15 * DAY) : null,
            paidAt,
            paymentMethod: paidAt ? (t.method ?? "BANK_TRANSFER") : null,
            paymentReference:
                paidAt && t.method === "BANK_TRANSFER"
                    ? `NEFT ${digits(tradeRng, 10)}`
                    : paidAt
                      ? `UPI ref ${digits(tradeRng, 12)}`
                      : null,
            paymentNote: null,
            contactId: contactId(c.key),
            billTo: {
                name: `${c.first} ${c.last}`,
                email: c.email,
                gstin: gstin(c.state, c.pan),
                state: c.state,
                address: c.address,
            },
            placeOfSupply: c.state,
            lines: t.lines,
            createdByUserId: owner,
        });
        const seen = firstSeen.get(c.key);
        if (!seen || createdAt < seen) firstSeen.set(c.key, createdAt);
    });

    // --- CRM contacts: subscribers, the cafés, and one walk-in
    const contactRng = rngFor("contacts");
    const addContact = (
        key: string,
        person: { first: string; last: string; phone: string },
        email: string,
        company: string | null,
        source: string,
    ) => {
        const seen = firstSeen.get(key);
        const at = seen
            ? addMinutes(seen, -contactRng.int(60, 3 * 24 * 60))
            : istAt(
                  now,
                  -contactRng.int(12, 40),
                  contactRng.int(10 * 60, 18 * 60),
              );
        w.contacts.push({
            id: contactId(key),
            organizationId: orgId,
            email,
            firstName: person.first,
            lastName: person.last,
            phone: person.phone,
            company,
            source,
            createdAt: at,
            updatedAt: at,
        });
    };
    for (const s of subscribers) {
        const person =
            s.shopper !== null
                ? SHOPPERS[s.shopper]
                : SUBSCRIBERS_ONLY.find((x) => x.key === s.key);
        if (!person) continue;
        addContact(
            s.key,
            person,
            emailOf(person),
            null,
            s.shopper !== null ? "WEBSITE" : "WALK_IN",
        );
    }
    for (const c of CAFES) {
        addContact(c.key, c, c.email, c.company, "REFERRAL");
    }
    // Rohan came to a tasting and was added by hand; he also shops online
    // under the same email. Nobody has linked the two: a possible match.
    addContact(
        "rohan",
        SHOPPERS[SHOPPER.rohan],
        emailOf(SHOPPERS[SHOPPER.rohan]),
        null,
        "WALK_IN",
    );

    // --- identity links: each subscriber's contact to their store customer
    for (const s of subscribers) {
        if (s.shopper === null) continue;
        const contact = w.contacts.find((c) => c.id === contactId(s.key));
        const customer = w.customers.find(
            (c) => c.id === customerId(s.shopper ?? 0),
        );
        const at = [contact?.createdAt, customer?.createdAt]
            .filter((x): x is Date => x instanceof Date)
            .reduce((a, b) => (a > b ? a : b));
        w.links.push({
            id: sid("link", s.key),
            organizationId: orgId,
            contactId: contactId(s.key),
            customerId: customerId(s.shopper),
            linkedByUserId: owner,
            createdAt: earliest(addMinutes(at, 45), addMinutes(now, -10)),
        });
    }

    // --- notes: Priya's sesame allergy, and how she collects
    const noteAt = (daysAgo: number, minute: number) =>
        istAt(now, -daysAgo, minute);
    w.notes.push(
        {
            id: sid("note", "priya", 0),
            organizationId: orgId,
            contactId: contactId("priya"),
            body: "Allergic to sesame — use the plain bun tray.",
            createdByUserId: input.counterUserId,
            updatedByUserId: input.counterUserId,
            createdAt: noteAt(11, 8 * 60 + 15),
            updatedAt: noteAt(11, 8 * 60 + 15),
        },
        {
            id: sid("note", "priya", 1),
            organizationId: orgId,
            contactId: contactId("priya"),
            body: "Collects on Saturdays before 8. Likes the dark end of the loaf.",
            createdByUserId: owner,
            updatedByUserId: owner,
            createdAt: noteAt(21, 18 * 60 + 40),
            updatedAt: noteAt(21, 18 * 60 + 40),
        },
    );
    w.noteAllergens.push({
        noteId: sid("note", "priya", 0),
        allergenId: input.allergenId.Sesame,
        organizationId: orgId,
    });

    // --- what the lines hold and sold, and the stock log they write
    const stock = planStock({
        now,
        today: todayClock(now),
        orgId,
        stores: input.stores,
        productIds: input.productIds,
        variantIds: input.variantIds,
        shelfIds: input.shelfIds,
        owner,
        nisha: input.counterUserId,
        lines: stockLines,
    });
    for (const item of w.items) {
        const held = stock.items.get(item.id ?? "");
        if (held) Object.assign(item, held);
    }
    return { ...w, stock };
}

// --- Writing ------------------------------------------------------------------------

async function writeWorld(prisma: Db, orgId: string, w: World) {
    await prisma.customer.createMany({ data: w.customers });
    await prisma.contact.createMany({ data: w.contacts });
    await prisma.order.createMany({ data: w.orders });
    await prisma.orderItem.createMany({ data: w.items });
    await prisma.orderEvent.createMany({ data: w.events });
    await prisma.paymentIntent.createMany({ data: w.intents });
    await prisma.paymentAttempt.createMany({ data: w.attempts });
    await prisma.paymentRefund.createMany({ data: w.refunds });
    await prisma.paymentRefundLine.createMany({ data: w.refundLines });
    await prisma.customerSubscription.createMany({ data: w.subscriptions });
    await prisma.subscriptionSkip.createMany({ data: w.skips });
    await prisma.customerIdentityLink.createMany({ data: w.links });
    await prisma.contactNote.createMany({ data: w.notes });
    await prisma.contactNoteAllergen.createMany({ data: w.noteAllergens });
    await writeDocuments(prisma, orgId, w.docs);
}

/** The financial year of an instant, in Kolkata: 23 Sep 2026 → "26-27". */
function financialYear(at: Date): string {
    const local = new Date(at.getTime() + IST);
    const start =
        local.getUTCMonth() >= 3
            ? local.getUTCFullYear()
            : local.getUTCFullYear() - 1;
    const yy = (y: number) => String(y % 100).padStart(2, "0");
    return `${yy(start)}-${yy(start + 1)}`;
}

/**
 * Number every issued document in its series, in the order it was issued,
 * and write the invoices, their lines and the sequences. An invoice someone
 * issued by hand here keeps its number; the seed refuses rather than hand the
 * same number out twice.
 */
async function writeDocuments(prisma: Db, orgId: string, docs: DocSpec[]) {
    const seriesOf = (d: DocSpec, at: Date) =>
        `${GST.prefix}${d.kind === "CREDIT_NOTE" ? "CN" : ""}/${financialYear(at)}`;
    const issued = docs
        .filter((d) => d.issuedAt)
        .sort(
            (a, b) =>
                (a.issuedAt?.getTime() ?? 0) - (b.issuedAt?.getTime() ?? 0) ||
                a.id.localeCompare(b.id),
        );
    const last = new Map<string, number>();
    const numbers = new Map<string, string>();
    for (const d of issued) {
        const key = seriesOf(d, d.issuedAt ?? new Date(0));
        const n = (last.get(key) ?? 0) + 1;
        last.set(key, n);
        numbers.set(d.id, `${key}/${String(n).padStart(4, "0")}`);
    }

    const byHand = await prisma.invoice.findMany({
        where: {
            organizationId: orgId,
            number: { not: null },
            NOT: { id: { startsWith: RYE.prefix } },
        },
        select: { number: true },
    });
    const handLast = new Map<string, number>();
    for (const { number } of byHand) {
        const m = /^(.*)[/-](\d+)$/.exec(number ?? "");
        if (!m) continue;
        const key = m[1];
        const n = Number(m[2]);
        if (n <= (last.get(key) ?? 0)) {
            throw new Error(
                `${NAME} has an invoice issued by hand (${number}) that holds a number ` +
                    `the showcase needs. Run db:seed:reset, then seed again.`,
            );
        }
        handLast.set(key, Math.max(n, handLast.get(key) ?? 0));
    }

    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    for (const d of docs) {
        const inter = d.placeOfSupply !== GST.state;
        const taxed = d.lines.map((l) => taxLine(l, inter));
        const sum = (pick: (l: DocLine) => number) =>
            taxed.reduce((s, l) => s + pick(l), 0);
        const total = sum((l) => l.amountPaise);
        const cgst = sum((l) => l.cgstPaise);
        const sgst = sum((l) => l.sgstPaise);
        const igst = sum((l) => l.igstPaise);
        const tax = cgst + sgst + igst;
        const isIssued = d.issuedAt !== null;
        invoices.push({
            id: d.id,
            organizationId: orgId,
            number: numbers.get(d.id) ?? null,
            status: d.status,
            kind: d.kind,
            relatedInvoiceId: d.relatedInvoiceId ?? null,
            orderId: d.orderId ?? null,
            paymentRefundId: d.paymentRefundId ?? null,
            contactId: d.contactId ?? null,
            // Name and email are copied on issue; GST details from the draft.
            billToName: isIssued ? d.billTo.name : null,
            billToEmail: isIssued ? d.billTo.email : null,
            billToGstin: d.billTo.gstin,
            billToState: d.billTo.state,
            billToAddress: d.billTo.address,
            sellerGstin: RYE_GSTIN,
            sellerState: GST.state,
            sellerAddress: RYE_ADDRESS_PRINTED,
            placeOfSupply: d.placeOfSupply,
            taxType: inter ? "INTER" : "INTRA",
            cgst: rupees(cgst),
            sgst: rupees(sgst),
            igst: rupees(igst),
            currency: CURRENCY,
            subtotal: rupees(total - tax),
            tax: rupees(tax),
            total: rupees(total),
            issuedAt: d.issuedAt,
            dueAt: d.dueAt,
            paidAt: d.paidAt,
            paymentMethod: d.paymentMethod,
            paymentReference: d.paymentReference,
            paymentNote: d.paymentNote,
            source: d.source,
            subscriptionId: d.subscriptionId ?? null,
            periodStart: d.period?.start ?? null,
            periodEnd: d.period?.end ?? null,
            createdByUserId: d.createdByUserId,
            createdAt: d.createdAt,
            updatedAt: d.paidAt ?? d.issuedAt ?? d.createdAt,
        });
        taxed.forEach((l, position) => {
            lines.push({
                id: `${d.id}_line_${position}`,
                organizationId: orgId,
                invoiceId: d.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: rupees(l.unitPaise),
                amount: rupees(l.amountPaise),
                discount: "0.00",
                hsnSac: l.code,
                gstRate: l.rateBps === null ? null : bpsToRate(l.rateBps),
                taxableValue: rupees(l.taxablePaise),
                cgst: rupees(l.cgstPaise),
                sgst: rupees(l.sgstPaise),
                igst: rupees(l.igstPaise),
                orderItemId: l.orderItemId ?? null,
            });
        });
    }
    // Originals before the corrections that point at them.
    await prisma.invoice.createMany({
        data: invoices.filter((i) => !i.relatedInvoiceId),
    });
    await prisma.invoice.createMany({
        data: invoices.filter((i) => i.relatedInvoiceId),
    });
    await prisma.invoiceLine.createMany({ data: lines });

    // Each series' counter at its last number, so the API's next follows on.
    await prisma.invoiceSequence.deleteMany({
        where: { organizationId: orgId },
    });
    const keys = Array.from(
        new Set(Array.from(last.keys()).concat(Array.from(handLast.keys()))),
    );
    await prisma.invoiceSequence.createMany({
        data: keys.sort().map((series) => ({
            organizationId: orgId,
            series,
            lastNumber: Math.max(
                last.get(series) ?? 0,
                handLast.get(series) ?? 0,
            ),
        })),
    });
}
