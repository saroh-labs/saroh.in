import type { SeedSection, SeedSite } from "../data";
import type { Db } from "../helpers";
import { id, writeSite } from "../helpers";
import { SHOWCASE_KEY } from "./data";

/**
 * Leela & Loom's website, `leela-and-loom.saroh.app.localhost`: a home page
 * with what is new and what people said, the collections, the shop's story
 * and how to find it on Commercial Street — the shop itself is the site's
 * `/shop`, selling from the boutique's one storefront, and its writing is
 * the journal at `/blog`. Written the way every seeded site is
 * (`writeSite`), published.
 *
 * Its storefront becomes a shop people can walk into (address, hours,
 * collection and delivery), its four collections are written here, and
 * the site's shop is switched on for it (`SITE_SHOP`, which fails closed
 * when never set): the product grids and `/shop` read all three live.
 */

const KEY = "ll";
const sid = (...parts: (string | number)[]) => id(SHOWCASE_KEY, KEY, ...parts);

export const LEELA_SITE_SLUG = "leela-and-loom";

/** The hours on the storefront, Monday first: shut on Tuesdays. */
const HOURS = [
    { day: "MON", open: "11:00", close: "20:30", closed: false },
    { day: "TUE", open: "11:00", close: "20:30", closed: true },
    { day: "WED", open: "11:00", close: "20:30", closed: false },
    { day: "THU", open: "11:00", close: "20:30", closed: false },
    { day: "FRI", open: "11:00", close: "20:30", closed: false },
    { day: "SAT", open: "11:00", close: "20:30", closed: false },
    { day: "SUN", open: "12:00", close: "20:00", closed: false },
];

/** Hand-picked collections, by product slug, in the order they show. */
export const LEELA_COLLECTIONS = [
    {
        key: "festive",
        slug: "festive-edit",
        name: "The festive edit",
        description:
            "Satin, florals and a glow that lasts through a long evening — for Navratri, Diwali and the weddings after.",
        picked: [
            "satin-slip-dress",
            "rust-cottage-maxi-dress",
            "floral-wrap-maxi-dress",
            "dot-print-flared-dress",
            "saffron-kumkumadi-face-oil",
            "vitamin-c-brightening-serum",
        ],
    },
    {
        key: "him",
        slug: "for-him",
        name: "For him",
        description: "Beard, shave and a face wash he will actually use.",
        picked: [
            "cedar-vetiver-beard-oil",
            "charcoal-face-wash-men",
            "daily-grooming-kit",
            "sandalwood-shaving-cream",
            "cooling-aftershave-mist",
            "matte-hair-clay",
        ],
    },
    {
        key: "cotton",
        slug: "cotton-and-linen",
        name: "Cotton and linen",
        description: "Breathable dresses for Bengaluru afternoons.",
        picked: [
            "belted-linen-shirt-dress",
            "blue-tiered-cotton-dress",
            "sage-tiered-sundress",
            "printed-a-line-kurta-dress",
            "red-polka-midi-dress",
        ],
    },
    {
        key: "routine",
        slug: "simple-routine",
        name: "A simple routine",
        description: "Cleanse, treat, moisturise, protect: four steps, done.",
        picked: [
            "rice-water-foaming-cleanser",
            "niacinamide-clarifying-serum",
            "oat-ceramide-gel-moisturiser",
            "aqua-gel-sunscreen-spf50",
            "sheer-tint-sunscreen-spf50",
        ],
    },
] as const;

/** A section the fixture type does not list, checked by the contract on write. */
const block = (type: string, content: Record<string, unknown>) =>
    ({ type, content }) as unknown as SeedSection;

function site(collectionId: Record<string, string>): SeedSite {
    return {
        slug: LEELA_SITE_SLUG,
        name: "Leela & Loom",
        subdomain: LEELA_SITE_SLUG,
        published: true,
        createdDaysAgo: 110,
        revision: "r1",
        navigationExtra: [
            { label: "Shop", href: "/shop" },
            { label: "Journal", href: "/blog" },
        ],
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "Skincare and dresses, chosen slowly",
                            subheading:
                                "A small shop on Commercial Street with gentle skincare for women and men, and dresses made to be lived in. Delivered across India; free over ₹1,499.",
                            cta: {
                                label: "Shop the festive edit",
                                href: "/collections",
                                style: "primary",
                            },
                        },
                    },
                    block("productGrid", {
                        title: "New in",
                        source: "newest",
                        count: 8,
                        showPrices: true,
                    }),
                    {
                        type: "features",
                        content: {
                            heading: "Why people come back",
                            items: [
                                {
                                    title: "Patch-tested, plainly labelled",
                                    body: "Every ingredient on the label and on the page, and a patch-test note on anything active.",
                                },
                                {
                                    title: "Exchange within seven days",
                                    body: "Dresses with the tags on, by courier or at the shop. Skincare unopened.",
                                },
                                {
                                    title: "Free delivery over ₹1,499",
                                    body: "Bengaluru in one or two working days, the metros in three to five.",
                                },
                            ],
                        },
                    },
                    block("testimonials", {
                        heading: "What customers say",
                        items: [
                            {
                                quote: "The linen shirt dress is the most worn thing in my wardrobe this monsoon — and the exchange for a size up took two days.",
                                name: "Meera K.",
                                role: "Bengaluru",
                            },
                            {
                                quote: "My husband finally uses a face wash. The charcoal one, every morning, without being asked.",
                                name: "Ishita M.",
                                role: "Pune",
                            },
                            {
                                quote: "They told me which serum not to buy for my skin. That's why I keep ordering from them.",
                                name: "Ananya R.",
                                role: "Chennai",
                            },
                        ],
                    }),
                    block("journal", {
                        title: "From the journal",
                        count: 3,
                        showExcerpts: true,
                        showImages: true,
                    }),
                ],
            },
            {
                path: "/collections",
                title: "Collections",
                sections: [
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value: "<h1>Collections</h1><p>Edits we put together for the season, for him, and for a routine that takes five minutes.</p>",
                        },
                    },
                    ...LEELA_COLLECTIONS.map((c) =>
                        block("productGrid", {
                            title: c.name,
                            source: "collection",
                            collectionId: collectionId[c.key],
                            count: 6,
                            showPrices: true,
                            note: c.description,
                        }),
                    ),
                ],
            },
            {
                path: "/about",
                title: "About",
                sections: [
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value: "<h1>About Leela &amp; Loom</h1><p>Leela &amp; Loom began as a skincare shelf in a tailoring shop on Commercial Street. The shelf grew into a shop, and the tailor's eye stayed: we stock dresses in fabrics that breathe — linen, cotton, a little satin for the evenings — and we cut them for Indian bodies and Bengaluru weather.</p><p>On the skincare side we keep the list short. Each serum, cleanser and sunscreen is something we would recommend to a friend, labelled with every ingredient, with a plain note on who it suits and who should skip it. We would rather talk you out of a product than sell you the wrong one.</p><p>Since 2024 we have also stocked a small men's shelf, because the men who came in with their partners kept asking.</p>",
                        },
                    },
                    {
                        type: "features",
                        content: {
                            heading: "How we choose",
                            items: [
                                {
                                    title: "Made in India, by makers we have met",
                                    body: "Our dresses are cut in Jaipur, Surat and here in Bengaluru; our skincare is made in small batches in Pune and Coimbatore.",
                                },
                                {
                                    title: "Fewer, better things",
                                    body: "Thirty-odd products, not three hundred. If it stops being good, it leaves the shelf.",
                                },
                                {
                                    title: "Honest about skin",
                                    body: "No product here cures anything. Patch-test, go slowly, and see a dermatologist for anything that persists.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/visit",
                title: "Visit us",
                sections: [
                    block("visitUs", {
                        title: "Come and see us on Commercial Street",
                        showMap: true,
                        showHours: true,
                    }),
                    {
                        type: "faq",
                        content: {
                            heading: "Before you visit",
                            items: [
                                {
                                    question: "Can I try a dress on?",
                                    answer: "Yes — there are two trial rooms, and we keep every size of a dress in the shop when we can.",
                                },
                                {
                                    question:
                                        "Can I collect an online order here?",
                                    answer: "Choose collect at checkout and we'll message you when it's ready, usually the same day.",
                                },
                                {
                                    question: "Where do I park?",
                                    answer: "Pay-and-park on Kamaraj Road, three minutes' walk. Commercial Street is best on foot.",
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
}

export async function writeLeelaSite(
    prisma: Db,
    a: {
        orgId: string;
        storeId: string;
        userId: string;
        now: Date;
        productId: (slug: string) => string;
    },
): Promise<string> {
    // A shop people walk into, which delivers too.
    const settings = {
        kind: "SHOP",
        address: "14 Commercial Street, Shivajinagar, Bengaluru 560001",
        openingHours: HOURS,
        collectionEnabled: true,
        shippingFee: "79.00",
        freeShippingThreshold: "1499.00",
    };
    await prisma.storeSettings.update({
        where: { storeId: a.storeId },
        data: settings,
    });

    // The collections the site's grids show.
    const collectionId: Record<string, string> = {};
    for (const c of LEELA_COLLECTIONS) {
        const data = { name: c.name, description: c.description };
        const row = await prisma.collection.upsert({
            where: {
                organizationId_slug: { organizationId: a.orgId, slug: c.slug },
            },
            update: data,
            create: {
                id: sid("collection", c.key),
                organizationId: a.orgId,
                slug: c.slug,
                ...data,
            },
        });
        collectionId[c.key] = row.id;
    }
    await prisma.collectionProduct.deleteMany({
        where: { collectionId: { in: Object.values(collectionId) } },
    });
    await prisma.collectionProduct.createMany({
        data: LEELA_COLLECTIONS.flatMap((c) =>
            c.picked.map((slug, position) => ({
                collectionId: collectionId[c.key],
                productId: a.productId(slug),
                organizationId: a.orgId,
                position,
            })),
        ),
    });

    // The site's shop, for this business: the flag is registered dark,
    // as the product ships it, and on for the boutique.
    await prisma.featureFlag.upsert({
        where: { key: "SITE_SHOP" },
        update: {},
        create: {
            id: "flag_SITE_SHOP",
            key: "SITE_SHOP",
            description:
                "Opens the shop on a business's website: /shop, product pages and the Sells from setting.",
            enabledByDefault: false,
        },
    });
    await prisma.featureFlagOverride.upsert({
        where: {
            flagKey_organizationId: {
                flagKey: "SITE_SHOP",
                organizationId: a.orgId,
            },
        },
        update: { enabled: true },
        create: {
            id: sid("flagoverride", "site_shop"),
            flagKey: "SITE_SHOP",
            organizationId: a.orgId,
            enabled: true,
        },
    });

    const siteId = await writeSite(prisma, {
        fixture: site(collectionId),
        orgId: a.orgId,
        userId: a.userId,
        now: a.now,
        ids: {
            site: sid("site"),
            page: (p) => sid("page", p),
            pageVersion: (p) => sid("pageversion", p),
            section: (p, n) => sid("section", p, n),
            sectionKey: (p, n) => sid("sectionkey", p, n),
            form: (p, n) => sid("form", p, n),
            publication: sid("publication"),
        },
        pipelineId: null,
        serviceId: () => {
            throw new Error("Leela & Loom's site lists no services");
        },
        footer: {
            format: "text",
            value: "Leela & Loom · 14 Commercial Street, Bengaluru 560001 · Open 11am–8:30pm, closed Tuesdays",
        },
    });
    // It sells from the boutique's one storefront.
    await prisma.site.update({
        where: { id: siteId },
        data: { storefrontId: a.storeId },
    });
    return siteId;
}
