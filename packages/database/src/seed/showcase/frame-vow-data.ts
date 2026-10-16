import type { SeedSite } from "../data";
import { FV_POSTS } from "./frame-vow-posts";
import type {
    StudioProduct,
    StudioService,
    StudioSpec,
    StudioVariant,
} from "./studio";
import { blockImage, section } from "./studio";
import { STUDIO_ART } from "./studio-art";
import { FV_PHOTOS } from "./studio-photos";

/**
 * Golden Hour's fixed facts: a wedding photography and planning studio on
 * Lake Palace Road, Udaipur, with a Jaipur desk — Kabir Shekhawat (lead
 * photographer, the founder), Ishaan Mathur (second shooter and films),
 * Meher Bhati (planner, the one with a login) and Tanvi Purohit (décor).
 *
 * How it sells, as such a studio does:
 * - SHOOTS are services in the diary. Small ones (portraits, maternity,
 *   newborn, a couple session) are paid in full on the booking page; a
 *   corporate half day is billed after; a wedding's days (pre-wedding,
 *   haldi, the wedding) are a JOB: a 25% advance invoice holds the date and
 *   the 75% balance is invoiced once the edit is delivered.
 * - PRINTS AND ALBUMS are products ordered online by past couples and
 *   families: a 27-variant flush-mount album (size × cover × pages, one
 *   option because a product carries one), canvas, fine-art prints, frames.
 * - PLANNING ADD-ONS — décor themes, catering per plate, a DJ night, a
 *   mehendi artist — are products too, so they have a page, photos and a
 *   price on the site, but they are never ordered online: they are quoted
 *   (a draft invoice) and billed on the couple's planning invoices, the
 *   catering by the plate count after the event. SAC 998596.
 *
 * GST-registered in Rajasthan (08), prices include 18% GST: photography
 * SAC 998385, prints and albums 998386, planning 998596.
 */

export const FV_KEY = "fv";

const P = FV_PHOTOS;
const A = STUDIO_ART;

/** A Kolkata week: Sunday first. */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;
const MON_SAT = [1, 2, 3, 4, 5, 6] as const;

export const FV_SERVICES: readonly StudioService[] = [
    {
        key: "consult",
        name: "Planning consultation",
        description:
            "Thirty minutes with Meher or Kabir: your dates, venues, guest count and what matters most. At the studio on Lake Palace Road or by video. Free, and you leave with a written estimate.",
        minutes: 30,
        pricePaise: 0,
        sac: "998596",
        depositMode: "NONE",
        locationType: "EITHER",
        meetingUrl: "https://meet.jit.si/golden-hour-weddings-consultation",
        shown: true,
        pay: "free",
        perMonth: 24,
        ahead: [1, 9],
    },
    {
        key: "engagement",
        name: "Engagement & roka coverage",
        description:
            "Four hours of photographs for a ring ceremony or roka, at home or a venue in Udaipur or Jaipur. About 150 edited photographs within three weeks. Includes GST.",
        minutes: 240,
        pricePaise: 45_000_00,
        sac: "998385",
        depositMode: "PERCENT_25",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "job",
        perMonth: 0,
        ahead: [20, 70],
    },
    {
        key: "prewedding",
        name: "Pre-wedding shoot",
        description:
            "Half a day at two Udaipur locations — the ghats, a haveli courtyard, the hills at sunset. 40 edited photographs and a 60-second film. Includes GST.",
        minutes: 300,
        pricePaise: 65_000_00,
        sac: "998385",
        depositMode: "PERCENT_25",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "job",
        perMonth: 0,
        ahead: [20, 90],
    },
    {
        key: "haldi",
        name: "Haldi & mehendi coverage",
        description:
            "One day, both functions: the haldi in the morning, the mehendi into the evening. Two photographers. Includes GST.",
        minutes: 480,
        pricePaise: 55_000_00,
        sac: "998385",
        depositMode: "PERCENT_25",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "job",
        perMonth: 0,
        ahead: [60, 240],
    },
    {
        key: "wedding",
        name: "Wedding day photo + film",
        description:
            "Two photographers and a filmmaker from the baraat to the vidaai. About 400 edited photographs, a five-minute highlight film and the full ceremony film. A 25% advance holds your date. Includes GST.",
        minutes: 720,
        pricePaise: 2_40_000_00,
        sac: "998385",
        depositMode: "PERCENT_25",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "job",
        perMonth: 0,
        ahead: [60, 300],
    },
    {
        key: "maternity",
        name: "Maternity session",
        description:
            "Two hours at the studio or at golden hour by Fateh Sagar. Gowns available. 30 edited photographs. Includes GST.",
        minutes: 120,
        pricePaise: 18_000_00,
        sac: "998385",
        depositMode: "FULL",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "online",
        perMonth: 6,
        ahead: [5, 30],
    },
    {
        key: "newborn",
        name: "Newborn session",
        description:
            "Best in the first two weeks. A warm studio, all the time the baby needs, props washed and ready. 25 edited photographs. Includes GST.",
        minutes: 120,
        pricePaise: 16_000_00,
        sac: "998385",
        depositMode: "FULL",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "online",
        perMonth: 4,
        ahead: [2, 14],
    },
    {
        key: "family",
        name: "Family portraits",
        description:
            "Ninety minutes for three generations, at the studio or your home in Udaipur. 30 edited photographs. Includes GST.",
        minutes: 90,
        pricePaise: 12_000_00,
        sac: "998385",
        depositMode: "FULL",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "online",
        perMonth: 9,
        ahead: [3, 25],
    },
    {
        key: "couple",
        name: "Couple portrait session",
        description:
            "An hour for an anniversary or just because, by the lake or in the old city. 20 edited photographs. Includes GST.",
        minutes: 60,
        pricePaise: 8_500_00,
        sac: "998385",
        depositMode: "FULL",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "online",
        perMonth: 8,
        ahead: [2, 20],
    },
    {
        key: "corporate",
        name: "Corporate event coverage",
        description:
            "A half day for a conference, an offsite or a launch at a Udaipur hotel. Edited photographs the next working day. Billed to your company with its GSTIN. Includes GST.",
        minutes: 300,
        pricePaise: 35_000_00,
        sac: "998385",
        depositMode: "NONE",
        locationType: "IN_PERSON",
        meetingUrl: null,
        shown: true,
        pay: "desk",
        perMonth: 3,
        ahead: [7, 35],
    },
];

// --- Products ------------------------------------------------------------------------

const SIZES = [
    { title: "10×12", code: "1012", paise: 22_000_00 },
    { title: "12×15", code: "1215", paise: 28_000_00 },
    { title: "12×18", code: "1218", paise: 34_000_00 },
] as const;
const COVERS = [
    { title: "Linen", code: "LIN", paise: 0, image: 0 },
    { title: "Leather", code: "LEA", paise: 4_000_00, image: 1 },
    { title: "Acrylic", code: "ACR", paise: 6_500_00, image: 2 },
] as const;
const PAGES = [
    { title: "30 pages", code: "30", paise: 0 },
    { title: "40 pages", code: "40", paise: 4_500_00 },
    { title: "50 pages", code: "50", paise: 9_000_00 },
] as const;

/** Every size × cover × pages, priced from the size and what each adds. */
const ALBUM_VARIANTS: StudioVariant[] = SIZES.flatMap((s) =>
    COVERS.flatMap((c) =>
        PAGES.map((p) => ({
            title: `${s.title} · ${c.title} · ${p.title}`,
            sku: `GH-ALB-${s.code}-${c.code}-${p.code}`,
            pricePaise: s.paise + c.paise + p.paise,
            image: c.image,
        })),
    ),
);

const v = (
    title: string,
    sku: string,
    rupees: number,
    image?: number,
): StudioVariant => ({
    title,
    sku,
    pricePaise: rupees * 100,
    ...(image === undefined ? {} : { image }),
});

export const FV_PRODUCTS: readonly StudioProduct[] = [
    {
        slug: "heirloom-wedding-album",
        name: "Heirloom flush-mount wedding album",
        category: "albums",
        description:
            "Thick, lay-flat pages printed on archival photo paper and bound by hand in Jaipur, so a spread runs across the gutter without losing a face.\n\nChoose the size, the cover — sand linen, leather or an acrylic photo cover — and the pages. We design it from your favourites and send a proof before anything is printed. Three weeks from approved proof to your door. Includes GST.",
        pricePaise: ALBUM_VARIANTS[0].pricePaise,
        hsn: "998386",
        keyPoints: [
            "Lay-flat pages, archival paper",
            "Designed by us, proof before print",
            "Three weeks from approved proof",
        ],
        materials:
            "Archival lustre photo paper; linen, leather or acrylic cover; boxed",
        images: [
            A.albumLinen,
            A.albumLeather,
            A.albumAcrylic,
            A.albumSizes,
            P.albumOpen,
        ],
        option: { name: "Size · cover · pages", variants: ALBUM_VARIANTS },
        fulfilment: "SHIPPING",
        demand: 7,
    },
    {
        slug: "parent-album",
        name: "Parent album, 8×10",
        category: "albums",
        description:
            "A smaller copy of your album for each set of parents: 20 pages, the same design, the same paper. Most couples order two. Includes GST.",
        pricePaise: 9_500_00,
        hsn: "998386",
        keyPoints: ["20 pages", "Matches your main album", "Ships with it"],
        materials: "Archival lustre photo paper; linen or leather cover",
        images: [P.albumStack, A.albumLinen],
        option: {
            name: "Parent album cover",
            variants: [
                v("Linen", "GH-PAR-LIN", 9_500, 1),
                v("Leather", "GH-PAR-LEA", 11_500),
            ],
        },
        fulfilment: "SHIPPING",
        demand: 9,
    },
    {
        slug: "gallery-canvas",
        name: "Gallery-wrapped canvas",
        category: "prints",
        description:
            "Your photograph on cotton canvas, stretched over a 38 mm pine frame and wrapped round the edges, ready to hang. Colour-checked by us before it goes to print. Includes GST.",
        pricePaise: 4_800_00,
        hsn: "998386",
        keyPoints: [
            "Ready to hang",
            "38 mm frame",
            "Colour-checked before print",
        ],
        materials: "Cotton canvas, pine stretcher bars",
        images: [A.canvasWall, P.wedding8b],
        option: {
            name: "Canvas size",
            variants: [
                v("12×18 in", "GH-CAN-1218", 4_800),
                v("16×24 in", "GH-CAN-1624", 7_200),
                v("20×30 in", "GH-CAN-2030", 10_500),
                v("24×36 in", "GH-CAN-2436", 14_500),
            ],
        },
        fulfilment: "SHIPPING",
        demand: 18,
    },
    {
        slug: "fine-art-print",
        name: "Fine-art cotton rag print",
        category: "prints",
        description:
            "Printed on 308 gsm cotton rag with archival pigment inks — matte for black and white, pearl for colour that holds its depth. Shipped flat between boards. Includes GST.",
        pricePaise: 2_400_00,
        hsn: "998386",
        keyPoints: [
            "308 gsm cotton rag",
            "Archival pigment inks",
            "Shipped flat",
        ],
        materials: "Cotton rag paper",
        images: [P.fineArtPrint],
        option: {
            name: "Print size and finish",
            variants: [
                v("8×12 · Matte", "GH-FA-0812-M", 2_400),
                v("8×12 · Pearl", "GH-FA-0812-P", 2_600),
                v("12×18 · Matte", "GH-FA-1218-M", 4_200),
                v("12×18 · Pearl", "GH-FA-1218-P", 4_500),
                v("16×24 · Matte", "GH-FA-1624-M", 6_800),
                v("16×24 · Pearl", "GH-FA-1624-P", 7_200),
            ],
        },
        fulfilment: "SHIPPING",
        demand: 22,
    },
    {
        slug: "sheesham-frame",
        name: "Sheesham wood frame with print",
        category: "frames",
        description:
            "A solid sheesham frame made by a workshop in Jodhpur, with your print behind glass and a soft white mount. Stands on a table or hangs. Includes GST.",
        pricePaise: 3_200_00,
        hsn: "998386",
        keyPoints: [
            "Solid sheesham",
            "Glass and white mount",
            "Stands or hangs",
        ],
        materials: "Sheesham wood, glass, acid-free mount",
        images: [A.frameDesk],
        option: {
            name: "Frame size",
            variants: [
                v("8×10 in", "GH-FR-0810", 3_200),
                v("12×15 in", "GH-FR-1215", 5_400),
                v("16×20 in", "GH-FR-1620", 7_900),
            ],
        },
        fulfilment: "SHIPPING",
        demand: 20,
    },
    {
        slug: "extra-edited-photographs",
        name: "Extra edited photographs",
        category: "prints",
        description:
            "More of your wedding, edited the way your gallery was: pick them from the full proof set and they land in your gallery within ten days. Includes GST.",
        pricePaise: 6_000_00,
        hsn: "998386",
        keyPoints: [
            "You choose from the proofs",
            "In your gallery within ten days",
        ],
        materials: null,
        images: [P.wedding3c, P.haldi],
        option: {
            name: "How many photographs",
            variants: [
                v("50 photographs", "GH-EDIT-50", 6_000),
                v("100 photographs", "GH-EDIT-100", 10_000),
                v("200 photographs", "GH-EDIT-200", 18_000),
            ],
        },
        fulfilment: "DIGITAL",
        demand: 14,
    },
    {
        slug: "keepsake-print-box",
        name: "Linen keepsake box with 30 prints",
        category: "prints",
        description:
            "Thirty 6×9 prints of your choice in a linen box with your names on the lid. The gift couples order for grandparents. Includes GST.",
        pricePaise: 6_500_00,
        hsn: "998386",
        keyPoints: ["30 prints, 6×9", "Names on the lid"],
        materials: "Linen-covered box, lustre prints",
        images: [A.printBox],
        fulfilment: "SHIPPING",
        demand: 6,
    },
    {
        slug: "drone-coverage",
        name: "Drone coverage",
        category: "add-ons",
        description:
            "A licensed pilot and permissions for the venue, for the baraat and the venue from above. Added to a wedding day; not every venue allows it, and we check first. Includes GST.",
        pricePaise: 28_000_00,
        hsn: "998385",
        keyPoints: ["Licensed pilot", "Venue permission checked first"],
        materials: null,
        images: [P.udaipurLake],
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "same-day-edit-film",
        name: "Same-day edit film",
        category: "add-ons",
        description:
            "A three-minute film of the day so far, cut on site and played at the reception. Needs a second filmmaker. Includes GST.",
        pricePaise: 35_000_00,
        hsn: "998385",
        keyPoints: ["Played at the reception", "Second filmmaker on site"],
        materials: null,
        images: [P.wedding5b],
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "extra-hour",
        name: "Extra hour of coverage",
        category: "add-ons",
        description:
            "When the baraat runs late — it does. Billed by the hour after the day, both photographers. Includes GST.",
        pricePaise: 9_500_00,
        hsn: "998385",
        keyPoints: ["Both photographers", "Billed after the day"],
        materials: null,
        images: [P.wedding2c],
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "floral-mandap",
        name: "Floral mandap",
        category: "planning",
        description:
            "Tanvi's mandap: rajnigandha, roses and marigold on a carved frame, draped and lit, built the night before and struck after the vidaai. Priced by size; the flowers follow the season. Includes GST.",
        pricePaise: 1_85_000_00,
        hsn: "998596",
        keyPoints: [
            "Built the night before",
            "Seasonal flowers",
            "Lighting included",
        ],
        materials: "Fresh flowers, carved wooden frame, fabric drapes",
        images: [P.decorMandap],
        option: {
            name: "Mandap size",
            variants: [
                v("Intimate · up to 150 guests", "GH-MANDAP-S", 1_85_000),
                v("Grand · up to 400 guests", "GH-MANDAP-L", 2_95_000),
            ],
        },
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "haldi-setup",
        name: "Marigold & mogra haldi setup",
        category: "planning",
        description:
            "A shaded haldi corner — genda torans, mogra strings, low seating and a brass urli — set up by 9 am so the photographs are done before the heat. Includes GST.",
        pricePaise: 65_000_00,
        hsn: "998596",
        keyPoints: ["Ready by 9 am", "Shade and low seating"],
        materials: "Marigold, mogra, cotton durries, brass",
        images: [P.decorHaldi],
        option: {
            name: "Haldi setup size",
            variants: [
                v("Courtyard · up to 80 guests", "GH-HALDI-S", 65_000),
                v("Lawn · up to 200 guests", "GH-HALDI-L", 95_000),
            ],
        },
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "sangeet-stage",
        name: "Sangeet stage & lights",
        category: "planning",
        description:
            "A raised stage, a dance floor, warm lights and a backdrop that photographs well. With an LED wall for the family's videos if you want one. Includes GST.",
        pricePaise: 1_40_000_00,
        hsn: "998596",
        keyPoints: [
            "Stage and dance floor",
            "Warm lighting",
            "LED wall optional",
        ],
        materials: null,
        images: [P.decorSangeet],
        option: {
            name: "Sangeet stage",
            variants: [
                v("Stage and lights", "GH-SANGEET", 1_40_000),
                v("With LED wall", "GH-SANGEET-LED", 2_10_000),
            ],
        },
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "catering-per-plate",
        name: "Catering, per plate",
        category: "planning",
        description:
            "From our partner kitchen in Udaipur, served by their own staff. Four menus, priced per plate; tasting for the couple before you confirm. Minimum 100 plates. You give us an estimate; the final count is billed after the event. Includes GST.",
        pricePaise: 1_450_00,
        hsn: "998596",
        keyPoints: [
            "Minimum 100 plates",
            "Tasting before you confirm",
            "Billed on the final count",
        ],
        materials: null,
        images: [A.cateringMenu, P.cateringThali, P.cateringBuffet],
        option: {
            name: "Menu",
            variants: [
                v("Veg classic", "GH-CAT-VC", 1_450),
                v("Veg royal Rajasthani", "GH-CAT-VR", 2_100),
                v("Non-veg classic", "GH-CAT-NC", 1_850),
                v("Non-veg royal", "GH-CAT-NR", 2_600),
            ],
        },
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "dj-sound-night",
        name: "DJ & sound night",
        category: "planning",
        description:
            "A DJ we've worked with for six seasons, sound for 400, lights for the floor, till the venue's cut-off. Includes GST.",
        pricePaise: 75_000_00,
        hsn: "998596",
        keyPoints: ["Sound for 400", "Till the venue's cut-off"],
        materials: null,
        images: [P.djNight],
        fulfilment: "PICKUP",
        demand: 0,
    },
    {
        slug: "mehendi-artist",
        name: "Mehendi artist",
        category: "planning",
        description:
            "Bridal mehendi to the elbow and feet, with your initials hidden somewhere, plus artists for the guests, priced by the hand. Includes GST.",
        pricePaise: 21_000_00,
        hsn: "998596",
        keyPoints: ["Natural henna", "Guests priced per hand"],
        materials: "Natural henna",
        images: [P.mehendiArtist],
        option: {
            name: "Mehendi",
            variants: [
                v("Bridal", "GH-MEH-BRIDE", 21_000),
                v("Guests, per hand", "GH-MEH-HAND", 350),
            ],
        },
        fulfilment: "PICKUP",
        demand: 0,
    },
];

// --- The site -------------------------------------------------------------------------

/** The portfolio: eight weddings, each with its story where the journal has one. */
export const FV_WEDDINGS = [
    {
        title: "Aditi & Karan",
        where: "A lake palace, Udaipur",
        when: "April",
        photo: P.wedding1a,
        summary:
            "Two days on Lake Pichola: everyone arrived by boat, the pheras were at sunset, and the whole family finally fitted into one photograph.",
    },
    {
        title: "Riya & Arjun",
        where: "The walled city, Jaipur",
        when: "January",
        photo: P.wedding2a,
        summary:
            "Amer at dawn the day before, a sangeet in her Dadi's courtyard, and a baraat past the Hawa Mahal.",
    },
    {
        title: "Neha & Siddharth",
        where: "A haveli near Gangaur Ghat, Udaipur",
        when: "June",
        photo: P.wedding3a,
        summary:
            "Sixty guests, no stage, no DJ — and a grandmother two metres from the fire for the pheras.",
    },
    {
        title: "Pooja & Nikhil",
        where: "Amer road, Jaipur",
        when: "May",
        photo: P.wedding4a,
        summary:
            "A morning wedding planned around the heat, with the mandap under old neem trees.",
    },
    {
        title: "Meera & Rohan",
        where: "Fateh Sagar, Udaipur",
        when: "May",
        photo: P.wedding5a,
        summary:
            "A Tamil-Rajasthani wedding with two ceremonies on one day and both grandmothers in charge.",
    },
    {
        title: "Sanya & Vivek",
        where: "Bagore ki Haveli lanes, Udaipur",
        when: "August",
        photo: P.wedding6a,
        summary:
            "Ninety guests on a monsoon afternoon, and the rain stopping exactly for the varmala.",
    },
    {
        title: "Tanya & Kunal",
        where: "Sajjangarh hills, Udaipur",
        when: "Pre-wedding",
        photo: P.wedding7a,
        summary:
            "Their pre-wedding on the Monsoon Palace road at sunset. The wedding is in November.",
    },
    {
        title: "Kavya & Ritvik",
        where: "Old city, Udaipur",
        when: "Engagement",
        photo: P.wedding8a,
        summary:
            "A small roka at home, and then the whole family on the ghats for portraits.",
    },
] as const;

/** Where the journal tells a wedding's story. */
export const FV_STORY_LINKS: Record<string, string> = {
    "Aditi & Karan": "/blog/aditi-and-karan-at-the-lake-palace",
    "Riya & Arjun": "/blog/a-jaipur-old-city-wedding-riya-and-arjun",
    "Neha & Siddharth": "/blog/a-small-haveli-wedding-neha-and-siddharth",
};

const FORM_FIELDS = [
    { name: "name", label: "Your names", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone or WhatsApp", type: "tel", required: true },
    { name: "date", label: "Wedding date (or month)", type: "text" },
    { name: "venue", label: "City or venue", type: "text" },
    { name: "guests", label: "Roughly how many guests", type: "text" },
    {
        name: "message",
        label: "Tell us about it",
        type: "textarea",
        required: true,
    },
] as const;

export function fvSite(): SeedSite {
    const storyLinks = FV_STORY_LINKS;
    return {
        slug: "golden-hour-weddings",
        name: "Golden Hour Weddings",
        subdomain: "golden-hour-weddings",
        published: true,
        createdDaysAgo: 200,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    section("hero", {
                        variant: "fullBleed",
                        heading:
                            "Weddings in Udaipur and Jaipur, photographed and planned by one team.",
                        subheading:
                            "Golden Hour Weddings is Kabir, Ishaan, Meher and Tanvi: photographs and films, the planning and the décor, from the first call to the album on your shelf.",
                        cta: {
                            label: "Book a free planning call",
                            href: "/book",
                            style: "primary",
                        },
                        image: blockImage(P.heroMandap),
                    }),
                    section("features", {
                        variant: "steps",
                        heading: "How a wedding with us works",
                        items: [
                            {
                                title: "A free call",
                                body: "Thirty minutes about dates, venues and guests. You leave with an estimate.",
                            },
                            {
                                title: "A 25% advance holds the date",
                                body: "We don't hold dates on a promise: the advance invoice confirms it.",
                            },
                            {
                                title: "The days themselves",
                                body: "Pre-wedding, haldi and mehendi, the wedding. Two photographers and a filmmaker.",
                            },
                            {
                                title: "Gallery, album, balance",
                                body: "Sneak peek in 72 hours, gallery in 4–6 weeks; the balance is due before the album goes to print.",
                            },
                        ],
                    }),
                    section("projects", {
                        variant: "rhythm",
                        title: "Recent weddings",
                        items: FV_WEDDINGS.slice(0, 4).map((w) => ({
                            image: blockImage(w.photo),
                            title: w.title,
                            summary: w.summary,
                            caption: `${w.where} · ${w.when}`,
                            ...(storyLinks[w.title]
                                ? { link: storyLinks[w.title] }
                                : {}),
                        })),
                    }),
                    section("journal", {
                        variant: "default",
                        title: "From the journal",
                        count: 3,
                    }),
                    {
                        type: "cta",
                        content: {
                            label: "Tell us about your wedding",
                            href: "/enquire",
                            style: "primary",
                        },
                    },
                ],
            },
            {
                path: "/portfolio",
                title: "Portfolio",
                sections: [
                    section("projects", {
                        variant: "cards",
                        title: "Weddings we've photographed",
                        showCount: true,
                        items: FV_WEDDINGS.map((w) => ({
                            image: blockImage(w.photo),
                            title: w.title,
                            summary: w.summary,
                            caption: `${w.where} · ${w.when}`,
                            ...(storyLinks[w.title]
                                ? { link: storyLinks[w.title] }
                                : {}),
                        })),
                    }),
                    section("gallery", {
                        layout: "masonry",
                        images: [
                            P.wedding1b,
                            P.wedding1c,
                            P.wedding2b,
                            P.wedding3b,
                            P.wedding3c,
                            P.wedding4b,
                            P.wedding5c,
                            P.wedding6b,
                            P.wedding7b,
                            P.wedding8b,
                            P.haldi,
                            P.mehendi,
                        ].map(blockImage),
                    }),
                ],
            },
            {
                path: "/packages",
                title: "Packages",
                sections: [
                    {
                        type: "servicesList",
                        services: [4, 3, 2, 1, 0, 5, 6, 7, 8, 9],
                        content: {
                            heading: "Packages and sessions",
                            intro: "Every price includes 18% GST. Wedding days are held with a 25% advance; the rest is invoiced once your edit is delivered.",
                            showPrices: true,
                        },
                    },
                    {
                        type: "faq",
                        content: {
                            heading: "Before you book",
                            items: [
                                {
                                    question: "How does the advance work?",
                                    answer: "25% of your package, invoiced when you say yes. It holds the date; we turn other couples away for it. The 75% balance is invoiced after your edited gallery is delivered and is due before the album goes to print.",
                                },
                                {
                                    question:
                                        "Do you travel outside Udaipur and Jaipur?",
                                    answer: "Yes, anywhere in Rajasthan and Gujarat, and further for a destination wedding. Travel and stay are billed at cost.",
                                },
                                {
                                    question: "When do we get the photographs?",
                                    answer: "A sneak peek in 72 hours, the full edited gallery in four to six weeks, the album three weeks after you approve its proof.",
                                },
                                {
                                    question: "Can we change our date?",
                                    answer: "Once, free, if we're free on the new date. The advance moves with you.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/planning",
                title: "Planning",
                sections: [
                    section("richText", {
                        format: "html",
                        value: "<h2>Planning and décor, by the same team</h2><p>Meher plans; Tanvi builds. We quote the décor, catering, music and mehendi together with your photography, so one team answers for the day. Catering is from our partner kitchen and billed per plate on the final count after the event.</p><table><thead><tr><th>What</th><th>From, incl. GST</th></tr></thead><tbody><tr><td>Floral mandap</td><td>₹1,85,000</td></tr><tr><td>Marigold &amp; mogra haldi setup</td><td>₹65,000</td></tr><tr><td>Sangeet stage &amp; lights</td><td>₹1,40,000</td></tr><tr><td>Catering, veg classic</td><td>₹1,450 a plate</td></tr><tr><td>Catering, veg royal Rajasthani</td><td>₹2,100 a plate</td></tr><tr><td>Catering, non-veg classic</td><td>₹1,850 a plate</td></tr><tr><td>Catering, non-veg royal</td><td>₹2,600 a plate</td></tr><tr><td>DJ &amp; sound night</td><td>₹75,000</td></tr><tr><td>Bridal mehendi</td><td>₹21,000</td></tr><tr><td>Guest mehendi</td><td>₹350 a hand</td></tr></tbody></table>",
                        image: blockImage(P.decorMandap),
                        imageSide: "right",
                    }),
                    section("gallery", {
                        layout: "grid",
                        images: [
                            P.decorHaldi,
                            P.decorSangeet,
                            P.cateringThali,
                            P.mehendiArtist,
                            P.djNight,
                            P.cateringBuffet,
                        ].map(blockImage),
                    }),
                    {
                        type: "cta",
                        content: {
                            label: "Ask for a planning estimate",
                            href: "/enquire",
                            style: "primary",
                        },
                    },
                ],
            },
            {
                path: "/enquire",
                title: "Enquire",
                sections: [
                    {
                        type: "enquiry",
                        form: { name: "Wedding enquiry", fields: FORM_FIELDS },
                        content: {
                            title: "Tell us about your wedding",
                            description:
                                "Dates, places, how many people. Meher replies within a day, usually on WhatsApp.",
                            submitLabel: "Send enquiry",
                            successMessage:
                                "Thank you — Meher will be in touch within a day.",
                        },
                    },
                ],
            },
            {
                path: "/about",
                title: "About",
                sections: [
                    section("person", {
                        variant: "team",
                        title: "The four of us",
                        name: "Kabir Shekhawat",
                        role: "Lead photographer, founder",
                        bio: "Kabir started Golden Hour Weddings in 2017 after six years assisting wedding photographers across Rajasthan. He still shoots every wedding we take.",
                        image: blockImage(P.studioCamera),
                        people: [
                            {
                                name: "Ishaan Mathur",
                                role: "Second shooter and films",
                                bio: "Cuts the highlight films. Will climb anything for the angle.",
                            },
                            {
                                name: "Meher Bhati",
                                role: "Wedding planner",
                                bio: "Runs the calendar, the vendors and the run-sheets. Answers WhatsApp faster than anyone.",
                            },
                            {
                                name: "Tanvi Purohit",
                                role: "Décor lead",
                                bio: "Designs and builds the mandaps, haldi corners and sangeet stages.",
                            },
                        ],
                    }),
                    section("richText", {
                        format: "html",
                        value: "<h2>The studio</h2><p>2nd floor, 14 Lake Palace Road, Udaipur 313001. Our Jaipur desk in C-Scheme is open on Tuesdays and Fridays by appointment.</p><p>Call or WhatsApp +91 00000 00056.</p>",
                        image: blockImage(P.udaipurLake),
                        imageSide: "left",
                    }),
                ],
            },
            {
                path: "/journal",
                title: "Journal",
                sections: [
                    section("journal", {
                        variant: "archive",
                        title: "Journal",
                        groupByYear: false,
                        showTotal: true,
                    }),
                ],
            },
        ],
    };
}

export function fvSpec(): StudioSpec {
    return {
        key: FV_KEY,
        name: "Golden Hour Weddings",
        slug: "golden-hour-weddings",
        legalName: "Golden Hour Weddings LLP",
        contactEmail: "goldenhourweddings@example.com",
        phone: "+910000000056",
        gst: {
            state: "08",
            stateName: "Rajasthan",
            pan: "AAJFG4821K",
            prefix: "GH",
        },
        address: {
            addressLine1: "2nd floor, 14 Lake Palace Road",
            addressLine2: "Near Chandpole",
            city: "Udaipur",
            postalCode: "313001",
        },
        createdDaysAgo: 260,
        modules: [
            "APPOINTMENTS",
            "CRM",
            "WEBSITE",
            "PAYMENTS",
            "COMMERCE",
            "INSIGHTS",
        ],
        store: {
            description:
                "Prints, albums and frames from Golden Hour Weddings, Udaipur.",
            openingHours: [
                { day: "MON", open: "10:30", close: "18:30", closed: false },
                { day: "TUE", open: "10:30", close: "18:30", closed: false },
                { day: "WED", open: "10:30", close: "18:30", closed: false },
                { day: "THU", open: "10:30", close: "18:30", closed: false },
                { day: "FRI", open: "10:30", close: "18:30", closed: false },
                { day: "SAT", open: "10:30", close: "18:30", closed: false },
                { day: "SUN", open: "10:30", close: "18:30", closed: true },
            ],
        },
        staff: [
            {
                key: "kabir",
                name: "Kabir Shekhawat",
                title: "Lead photographer",
                services: [
                    "consult",
                    "engagement",
                    "prewedding",
                    "haldi",
                    "wedding",
                    "maternity",
                    "newborn",
                    "family",
                    "couple",
                    "corporate",
                ],
                hours: [{ days: EVERY_DAY, from: "08:00", to: "21:00" }],
            },
            {
                key: "ishaan",
                name: "Ishaan Mathur",
                title: "Second shooter and films",
                services: [
                    "engagement",
                    "prewedding",
                    "haldi",
                    "wedding",
                    "maternity",
                    "newborn",
                    "family",
                    "couple",
                    "corporate",
                ],
                hours: [
                    { days: [0, 2, 3, 4, 5, 6], from: "08:00", to: "21:00" },
                ],
            },
            {
                key: "meher",
                name: "Meher Bhati",
                title: "Wedding planner",
                services: ["consult"],
                hours: [{ days: MON_SAT, from: "10:30", to: "18:30" }],
                member: true,
            },
            {
                key: "tanvi",
                name: "Tanvi Purohit",
                title: "Décor lead",
                services: ["consult"],
                hours: [{ days: [1, 2, 3, 4, 5], from: "11:00", to: "19:00" }],
            },
        ],
        rules: {
            bookAheadDays: 365,
            latestBookingMinutes: 24 * 60,
            freeCancelHours: 72,
        },
        services: FV_SERVICES,
        categories: [
            { key: "albums", name: "Albums" },
            { key: "prints", name: "Prints" },
            { key: "frames", name: "Frames" },
            { key: "add-ons", name: "Wedding add-ons" },
            { key: "planning", name: "Planning & décor" },
        ],
        products: FV_PRODUCTS,
        plans: [],
        pipeline: {
            name: "Wedding enquiries",
            stages: [
                "New enquiry",
                "Call done",
                "Quote sent",
                "Advance paid",
                "Booked",
                "Delivered",
            ],
        },
        site: fvSite(),
        footer: "Golden Hour Weddings · 2nd floor, 14 Lake Palace Road, Udaipur 313001 · +91 00000 00056",
        posts: FV_POSTS,
    };
}
