/**
 * Stride Physio — what the desk sells, and the site's photos.
 *
 * A physio clinic's counter: supports in sizes and sides, resistance band
 * loops by strength, kinesiology tape by colour, foam rollers by length, and
 * a few things for home exercise. Brands and makers are invented; copy is
 * written for this seed and makes no medical claim — a support gives support
 * and feedback, it doesn't fix anything. The clinic isn't GST-registered, so
 * no product carries a rate.
 *
 * Photographs are free-licence Unsplash images, credited and hot-linked,
 * each looked at before it was used. A band's strength and a tape's colour
 * per variant are generated images (`MOTION_SWATCHES`, `demoAsset`).
 *
 * Data only; the shared diary-shop writer seeds it.
 */

import type {
    DsImage,
    DsProduct,
    DsReview,
    DsSwatch,
    DsVariant,
} from "./diary-shop-types";
import { demoAsset } from "./diary-shop-types";

const STRIDE = {
    maker: "Stride Supports Pvt. Ltd.",
    madeIn: "Ludhiana, Punjab",
};
const KINETIQ = {
    maker: "Kinetiq Rehab Products",
    madeIn: "Jalandhar, Punjab",
};
const BODHI = { maker: "Bodhi Mats LLP", madeIn: "Bengaluru, Karnataka" };

/** Every photograph used below, looked at before it was chosen. */
const P = {
    sleeve: {
        url: "https://images.unsplash.com/photo-1652354989460-ecccd5644412?w=1600&q=80&auto=format&fit=crop",
        alt: "A white knitted compression sleeve on a knee",
        width: 1600,
        height: 1067,
        creditName: "Alexey Demidov",
        creditUrl: "https://unsplash.com/@alexeydemidov",
    },
    sleeve2: {
        url: "https://images.unsplash.com/photo-1628271554223-550dc5f5a1c4?w=1600&q=80&auto=format&fit=crop",
        alt: "A pair of legs in white knee sleeves, seen from the side",
        width: 1600,
        height: 2400,
        creditName: "semen zhuravlev",
        creditUrl: "https://unsplash.com/@sezha72",
    },
    hinged: {
        url: "https://images.unsplash.com/photo-1783698155811-e9ed6eb1c96e?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman standing on a promenade wearing a black hinged knee brace",
        width: 1600,
        height: 2400,
        creditName: "Zulfugar Karimov",
        creditUrl: "https://unsplash.com/@zulfugarkarimov",
    },
    hinged2: {
        url: "https://images.unsplash.com/photo-1783698154611-1fdf6b0931be?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman sitting on the grass with a black hinged brace on one knee",
        width: 1600,
        height: 1067,
        creditName: "Zulfugar Karimov",
        creditUrl: "https://unsplash.com/@zulfugarkarimov",
    },
    ankle: {
        url: "https://images.unsplash.com/photo-1733744578633-4c087bbde305?w=1600&q=80&auto=format&fit=crop",
        alt: "A player on a tennis court wearing teal ankle supports over her socks",
        width: 1600,
        height: 901,
        creditName: "Bare Kind",
        creditUrl: "https://unsplash.com/@barekind_bamboo_socks",
    },
    wrist: {
        url: "https://images.unsplash.com/photo-1752858579375-e379d0449d4c?w=1600&q=80&auto=format&fit=crop",
        alt: "A wrist and thumb splint with a rigid thumb support, worn on the right hand",
        width: 1600,
        height: 2138,
        creditName: "Adel Valeev",
        creditUrl: "https://unsplash.com/@adevaleev",
    },
    wrist2: {
        url: "https://images.unsplash.com/photo-1636124883996-fedf726177b9?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand in a black wrist brace giving a thumbs up",
        width: 1600,
        height: 2400,
        creditName: "Marwan Ahmed",
        creditUrl: "https://unsplash.com/@marwan15",
    },
    bands: {
        url: "https://images.unsplash.com/photo-1552226351-1ac7863af926?w=1600&q=80&auto=format&fit=crop",
        alt: "A pink resistance band loop around a woman's legs, just above the knees",
        width: 1600,
        height: 2776,
        creditName: "Gabriel Alenius",
        creditUrl: "https://unsplash.com/@gabrielalenius",
    },
    tape: {
        url: "https://images.unsplash.com/photo-1669125207581-789b24db33b8?w=1600&q=80&auto=format&fit=crop",
        alt: "Rolls of kinesiology tape in several colours on a white tray",
        width: 1600,
        height: 2395,
        creditName: "towel.studio",
        creditUrl: "https://unsplash.com/@towelstudio",
    },
    tape2: {
        url: "https://images.unsplash.com/photo-1643400063987-4fcf4ba5bb32?w=1600&q=80&auto=format&fit=crop",
        alt: "Strips of kinesiology tape on a woman's shoulder and upper back",
        width: 1600,
        height: 2133,
        creditName: "Iryna Muller",
        creditUrl: "https://unsplash.com/@travelertraveler_",
    },
    roller: {
        url: "https://images.unsplash.com/photo-1763004871583-4183d64096b1?w=1600&q=80&auto=format&fit=crop",
        alt: "Two foam rollers standing on end against a wall",
        width: 1600,
        height: 2400,
        creditName: "Tuaans",
        creditUrl: "https://unsplash.com/@tuaans_",
    },
    roller2: {
        url: "https://images.unsplash.com/photo-1738524108491-9a0db4067897?w=1600&q=80&auto=format&fit=crop",
        alt: "A man lying back over a foam roller on an exercise mat",
        width: 1600,
        height: 1067,
        creditName: "Sergio Kian",
        creditUrl: "https://unsplash.com/@sergiokian",
    },
    ball: {
        url: "https://images.unsplash.com/photo-1564647324470-a3c6f1a45fb6?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand holding a small grey massage ball",
        width: 1600,
        height: 1067,
        creditName: "I'M ZION",
        creditUrl: "https://unsplash.com/@ziontech",
    },
    ball2: {
        url: "https://images.unsplash.com/photo-1738496071079-605e5a741807?w=1600&q=80&auto=format&fit=crop",
        alt: "A bare foot rolling over a small blue massage ball on a wooden floor",
        width: 1600,
        height: 1067,
        creditName: "RAD Roller",
        creditUrl: "https://unsplash.com/@rad_roller",
    },
    mat: {
        url: "https://images.unsplash.com/photo-1637157216470-d92cd2edb2e8?w=1600&q=80&auto=format&fit=crop",
        alt: "Bare feet on a sage-green exercise mat in sunlight",
        width: 1600,
        height: 1067,
        creditName: "Junseong Lee",
        creditUrl: "https://unsplash.com/@bearsnap",
    },
    mat2: {
        url: "https://images.unsplash.com/photo-1646239646963-b0b9be56d6b5?w=1600&q=80&auto=format&fit=crop",
        alt: "Two cork blocks on a green exercise mat",
        width: 1600,
        height: 1066,
        creditName: "Samantha Sheppard",
        creditUrl: "https://unsplash.com/@samsheppardphoto",
    },
    dumbbell: {
        url: "https://images.unsplash.com/photo-1586401100295-7a8096fd231a?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand holding a pair of small pink vinyl dumbbells",
        width: 1600,
        height: 2400,
        creditName: "Juls P",
        creditUrl: "https://unsplash.com/@jules19",
    },
} satisfies Record<string, DsImage>;

export const MOTION_SERVICE_IMAGES: Record<string, DsImage> = {
    assessment: {
        url: "https://images.unsplash.com/photo-1649751361457-01d3a696c7e6?w=1600&q=80&auto=format&fit=crop",
        alt: "A physiotherapist examining a patient's bent knee on a treatment table",
        width: 1600,
        height: 1067,
        creditName: "yury kirillov",
        creditUrl: "https://unsplash.com/@relievemassage",
    },
    followup: {
        url: "https://images.unsplash.com/photo-1645005513713-9e2b92a687d3?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio guiding a patient through an arm exercise with light dumbbells",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    "sports-rehab": {
        url: "https://images.unsplash.com/photo-1610720991840-457ad2c7a658?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman doing a single-leg exercise with a band around her ankles",
        width: 1600,
        height: 2844,
        creditName: "Gabriel Alenius",
        creditUrl: "https://unsplash.com/@gabrielalenius",
    },
    "postop-rehab": {
        url: "https://images.unsplash.com/photo-1709880754445-8ffbd7e6ab3a?w=1600&q=80&auto=format&fit=crop",
        alt: "A clinician beside a patient at the parallel bars in a rehab room",
        width: 1600,
        height: 1067,
        creditName: "Ortopediatri Çocuk Ortopedi Akademisi",
        creditUrl: "https://unsplash.com/@ortopediatri",
    },
    "home-visit": {
        url: "https://images.unsplash.com/photo-1635367216109-aa3353c0c22e?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman doing a stretching exercise on a mat in her bedroom",
        width: 1600,
        height: 1067,
        creditName: "Cole Keister",
        creditUrl: "https://unsplash.com/@coleito",
    },
    "online-followup": {
        url: "https://images.unsplash.com/photo-1612832164313-ac0d7e07b5ce?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman on a video call from her sofa at home",
        width: 1600,
        height: 1067,
        creditName: "Surface",
        creditUrl: "https://unsplash.com/@surface",
    },
    "dry-needling": {
        url: "https://images.unsplash.com/photo-1740689580128-9173edce303f?w=1600&q=80&auto=format&fit=crop",
        alt: "Fine needles being placed by a practitioner's hand",
        width: 1600,
        height: 1200,
        creditName: "Christine Galligan",
        creditUrl: "https://unsplash.com/@galligancm",
    },
    "knee-programme": {
        url: "https://images.unsplash.com/photo-1645005512942-a17817fb7c11?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio correcting a patient's position during a band exercise",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    taping: {
        url: "https://images.unsplash.com/photo-1706795034887-be9a24d1ac19?w=1600&q=80&auto=format&fit=crop",
        alt: "A therapist smoothing kinesiology tape onto a patient's back",
        width: 1600,
        height: 2400,
        creditName: "Anna Keibalo",
        creditUrl: "https://unsplash.com/@anyutakejbalo",
    },
};

export const MOTION_GALLERY: DsImage[] = [
    {
        url: "https://images.unsplash.com/photo-1706353399656-210cca727a33?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio stretching a patient's shoulder on a treatment table",
        width: 1600,
        height: 1067,
        creditName: "Marc Zeman",
        creditUrl: "https://unsplash.com/@der_zeman",
    },
    {
        url: "https://images.unsplash.com/photo-1645005512914-c053ce912e43?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio helping a patient hold an arm exercise with small dumbbells",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    {
        url: "https://images.unsplash.com/photo-1643400063987-4fcf4ba5bb32?w=1600&q=80&auto=format&fit=crop",
        alt: "Kinesiology tape on a woman's shoulder and upper back",
        width: 1600,
        height: 2133,
        creditName: "Iryna Muller",
        creditUrl: "https://unsplash.com/@travelertraveler_",
    },
    {
        url: "https://images.unsplash.com/photo-1699523229199-fce5aa6b0ec3?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio's hands working on a patient's shoulder",
        width: 1600,
        height: 2397,
        creditName: "Edward Muntinga",
        creditUrl: "https://unsplash.com/@edwardmuntinga",
    },
    {
        url: "https://images.unsplash.com/photo-1518609571773-39b7d303a87b?w=1600&q=80&auto=format&fit=crop",
        alt: "Women doing an overhead exercise with resistance bands",
        width: 1600,
        height: 1067,
        creditName: "bruce mars",
        creditUrl: "https://unsplash.com/@brucemars",
    },
    {
        url: "https://images.unsplash.com/photo-1590333748338-d629e4564ad9?w=1600&q=80&auto=format&fit=crop",
        alt: "Runners' legs and shoes mid-stride on a city road",
        width: 1600,
        height: 978,
        creditName: "Miguel A Amutio",
        creditUrl: "https://unsplash.com/@amutiomi",
    },
];

/** The "Conditions we treat" page: knee, desk, sport, after surgery. */
export const MOTION_CONDITIONS_IMAGES = {
    knee: {
        url: "https://images.unsplash.com/photo-1687013367433-9077a7624830?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman sitting on a bed holding her knee",
        width: 1600,
        height: 1067,
        creditName: "Anna Auza",
        creditUrl: "https://unsplash.com/@annaauza",
    },
    desk: {
        url: "https://images.unsplash.com/photo-1504279664890-136a82299d1b?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman at a table rubbing her sore neck",
        width: 1600,
        height: 1312,
        creditName: "Keenan Constance",
        creditUrl: "https://unsplash.com/@keenangrams",
    },
    sport: {
        url: "https://images.unsplash.com/photo-1759674804375-3d0c038a0a6a?w=1600&q=80&auto=format&fit=crop",
        alt: "Two runners on a road, mid-stride",
        width: 1600,
        height: 2400,
        creditName: "Pierre-Antoine FRANCK",
        creditUrl: "https://unsplash.com/@pierreantoinef",
    },
    surgery: {
        url: "https://images.unsplash.com/photo-1663053822692-f036a147593c?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio helping a man through a strength exercise in a rehab gym",
        width: 1600,
        height: 1069,
        creditName: "TSquared Lab",
        creditUrl: "https://unsplash.com/@tsquaredlab",
    },
} satisfies Record<string, DsImage>;

export const MOTION_CATEGORIES: { key: string; name: string }[] = [
    { key: "supports", name: "Supports & braces" },
    { key: "bands-tape", name: "Bands & tape" },
    { key: "recovery", name: "Rollers & recovery" },
    { key: "home-exercise", name: "Home exercise" },
];

const SIDES = ["S", "M", "L"].flatMap((s) => [`${s} · Left`, `${s} · Right`]);

export const MOTION_OPTIONS: { key: string; name: string; values: string[] }[] =
    [
        { key: "size", name: "Size", values: ["S", "M", "L", "XL"] },
        { key: "size-side", name: "Size and side", values: SIDES },
        {
            key: "strength",
            name: "Strength",
            values: [
                "Yellow · Extra light",
                "Red · Light",
                "Green · Medium",
                "Blue · Heavy",
                "Black · Extra heavy",
            ],
        },
        {
            key: "colour",
            name: "Colour",
            values: ["Beige", "Black", "Blue", "Pink", "Green"],
        },
        { key: "length", name: "Length", values: ["30 cm", "45 cm", "90 cm"] },
        {
            key: "weight",
            name: "Weight",
            values: ["1 kg pair", "2 kg pair", "3 kg pair"],
        },
    ];

const v = (
    title: string,
    sku: string,
    onHand: number,
    warnAt: number,
    price: string | null = null,
    image?: string,
): DsVariant => ({
    title,
    sku,
    price,
    mrp: price,
    stock: { onHand, warnAt },
    imageIndex: null,
    ...(image ? { image } : {}),
});

const r = (
    rating: number,
    displayName: string,
    daysAgo: number,
    body: string,
    variantTitle: string | null = null,
    reply: string | null = null,
): DsReview => ({ rating, displayName, daysAgo, body, variantTitle, reply });

const BANDS = [
    {
        title: "Yellow · Extra light",
        hex: "#f2c623",
        colour: "Yellow",
        strength: "Extra light",
        price: "249",
        onHand: 14,
    },
    {
        title: "Red · Light",
        hex: "#d2322d",
        colour: "Red",
        strength: "Light",
        price: "249",
        onHand: 11,
    },
    {
        title: "Green · Medium",
        hex: "#2f8a3e",
        colour: "Green",
        strength: "Medium",
        price: "299",
        onHand: 3,
    },
    {
        title: "Blue · Heavy",
        hex: "#2556b8",
        colour: "Blue",
        strength: "Heavy",
        price: "299",
        onHand: 7,
    },
    {
        title: "Black · Extra heavy",
        hex: "#1d1d1f",
        colour: "Black",
        strength: "Extra heavy",
        price: "349",
        onHand: 0,
    },
] as const;
const bandFile = (colour: string) => `motion/band-${colour.toLowerCase()}.png`;

const TAPES = [
    { title: "Beige", hex: "#d9b99b", onHand: 18 },
    { title: "Black", hex: "#202022", onHand: 9 },
    { title: "Blue", hex: "#1f63b5", onHand: 12 },
    { title: "Pink", hex: "#e45a92", onHand: 2 },
    { title: "Green", hex: "#3aa25a", onHand: 5 },
] as const;
const tapeFile = (colour: string) => `motion/tape-${colour.toLowerCase()}.png`;

export const MOTION_PRODUCTS: DsProduct[] = [
    {
        slug: "stride-knee-compression-sleeve",
        name: "Stride Knee Compression Sleeve",
        category: "supports",
        option: "size",
        price: "699",
        mrp: "799",
        description:
            "A knitted sleeve that gives the knee gentle, even compression and a sense of support while you walk, climb stairs or get back to running. It doesn't hold the joint in place — it's for comfort and feedback, alongside your exercises.\n\nThe knit breathes in Bengaluru's humidity and washes well; silicone lines at the top stop it rolling down.",
        keyPoints: [
            "Even, gentle compression around the knee",
            "Breathable knit that dries quickly",
            "Silicone grip so it stays up",
            "Worn on either knee",
        ],
        howToUse:
            "Measure around the thigh 10 cm above the kneecap: S 34–38 cm, M 38–43 cm, L 43–48 cm, XL 48–53 cm. Pull it on with the patch centred over the kneecap. Snug, never painful; take it off to sleep.",
        materials: "Nylon 65%, spandex 25%, latex-free silicone 10%.",
        ...STRIDE,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: [
            v("S", "STR-KS-S", 6, 3),
            v("M", "STR-KS-M", 11, 4),
            v("L", "STR-KS-L", 2, 3),
            v("XL", "STR-KS-XL", 4, 2),
        ],
        images: [P.sleeve, P.sleeve2],
        demand: 3,
        reviews: [
            r(
                5,
                "Kavya R.",
                9,
                "Rohit measured me for it at my session. M fits well and it stays up through a 5 km walk at Cubbon Park.",
                "M",
                "Glad it fits, Kavya. Keep up the step-ups! — Shruti",
            ),
            r(
                4,
                "Prakash N.",
                27,
                "Good support on stairs at the office. Gets a bit warm by evening but that's the material.",
                "L",
            ),
            r(
                5,
                "Deepa S.",
                61,
                "Bought a second one so I can wash one. My knee feels less wobbly on long days.",
                "S",
            ),
        ],
    },
    {
        slug: "stride-hinged-knee-brace",
        name: "Stride Hinged Knee Brace",
        category: "supports",
        option: "size",
        price: "2450",
        mrp: "2450",
        description:
            "A wrap-around brace with metal hinges either side of the knee and four straps, for when your physio or surgeon wants the knee kept on track during walking and rehab. The open front sits around the kneecap, and the wrap design goes on without taking shoes off.\n\nWear it only as your physio advises; most people use it for a stage of their rehab, not for good.",
        keyPoints: [
            "Hinges either side keep side-to-side movement in check",
            "Open kneecap with a padded ring",
            "Wraps on with four straps — no pulling over the foot",
            "Fits either leg",
        ],
        howToUse:
            "Measure around the thigh 10 cm above the kneecap: S 36–41 cm, M 41–46 cm, L 46–51 cm, XL 51–56 cm. Line the hinges up with the joint line, fasten the lower straps first, then the upper. Ask the desk to check the fit the first time.",
        materials:
            "Neoprene-free breathable laminate, aluminium hinges, hook-and-loop straps.",
        ...STRIDE,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: [
            v("S", "STR-HKB-S", 2, 1),
            v("M", "STR-HKB-M", 4, 2),
            v("L", "STR-HKB-L", 3, 2),
            v("XL", "STR-HKB-XL", 1, 1),
        ],
        images: [P.hinged, P.hinged2],
        demand: 0.8,
        reviews: [
            r(
                5,
                "Arjun P.",
                33,
                "Used it for six weeks after my ACL surgery as Dr. Rohit suggested. Solid hinges, straps don't slip.",
                "L",
                "Good to hear, Arjun — and well done on the rehab. — Dr. Rohit",
            ),
            r(
                4,
                "Nandini K.",
                70,
                "Does the job. Takes a few tries to get the hinges in the right place; the desk showed me.",
                "M",
            ),
        ],
    },
    {
        slug: "stride-ankle-stabiliser",
        name: "Stride Ankle Stabiliser",
        category: "supports",
        option: "size-side",
        price: "899",
        mrp: "999",
        description:
            "A low-profile lace-up ankle support with figure-of-eight straps, made for the left or the right foot. It fits inside most sports shoes and gives the ankle a firmer feel when you go back to badminton, football or trail walks after a sprain.\n\nIt supports; it doesn't replace the balance and strength work that protects an ankle for good.",
        keyPoints: [
            "Made for the left or right foot",
            "Figure-of-eight straps for a firmer feel",
            "Slim enough for most sports shoes",
            "Washable",
        ],
        howToUse:
            "Measure around the ankle just above the bone: S 19–22 cm, M 22–25 cm, L 25–28 cm. Lace snugly, then cross the straps under the arch and fasten. Wear for sport; not needed for sitting.",
        materials: "Polyester mesh, nylon straps, hook-and-loop.",
        ...STRIDE,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: [
            v("S · Left", "STR-AS-SL", 3, 2),
            v("S · Right", "STR-AS-SR", 2, 2),
            v("M · Left", "STR-AS-ML", 5, 2),
            v("M · Right", "STR-AS-MR", 6, 2),
            v("L · Left", "STR-AS-LL", 0, 1),
            v("L · Right", "STR-AS-LR", 3, 1),
        ],
        images: [P.ankle],
        demand: 1.2,
        reviews: [
            r(
                4,
                "Sahana M.",
                15,
                "Back to badminton after a bad sprain. It fits in my court shoes and I feel more confident landing.",
                "M · Right",
            ),
            r(
                5,
                "Vinay G.",
                48,
                "Very good quality for the price. Make sure you buy the right side!",
                "L · Left",
                "Ha — good tip, Vinay. We now check the side at the desk. — Shruti",
            ),
        ],
    },
    {
        slug: "kinetiq-wrist-thumb-splint",
        name: "Kinetiq Wrist & Thumb Splint",
        category: "supports",
        option: "size-side",
        price: "749",
        mrp: "849",
        description:
            "A soft splint with a removable stay along the wrist and a shaped support for the thumb, for the left or right hand. Physios often suggest one for a sore thumb base or wrist while it settles, especially at night or for long phone and laptop days.",
        keyPoints: [
            "Left or right hand",
            "Removable stay along the wrist",
            "Shaped thumb support",
            "Soft lining for night wear",
        ],
        howToUse:
            "Measure around the wrist: S 13–15 cm, M 15–17 cm, L 17–19 cm. Slide the thumb in first, then fasten the straps from the wrist up. Wear as your physio suggests.",
        materials: "Polyester-cotton lining, aluminium stay, hook-and-loop.",
        ...KINETIQ,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: [
            v("S · Left", "KQ-WTS-SL", 3, 1),
            v("S · Right", "KQ-WTS-SR", 4, 1),
            v("M · Left", "KQ-WTS-ML", 2, 2),
            v("M · Right", "KQ-WTS-MR", 5, 2),
            v("L · Left", "KQ-WTS-LL", 2, 1),
            v("L · Right", "KQ-WTS-LR", 1, 1),
        ],
        images: [P.wrist, P.wrist2],
        demand: 0.7,
        reviews: [
            r(
                4,
                "Lakshmi I.",
                22,
                "Wore it at night for my thumb as Dr. Ananya said. Comfortable enough to sleep in.",
                "S · Right",
            ),
        ],
    },
    {
        slug: "kinetiq-resistance-band-loops",
        name: "Kinetiq Resistance Band Loop",
        category: "bands-tape",
        option: "strength",
        price: "249",
        mrp: "249",
        description:
            "A flat latex loop, 30 cm long, for the hip, knee and shoulder exercises your physio gives you to do at home. Five strengths by colour, from extra light for early rehab to extra heavy for strong legs.\n\nStart with the strength your physio picks and move up only when the last few repetitions feel easy.",
        keyPoints: [
            "Five strengths, colour-coded",
            "30 cm loop, 5 cm wide",
            "Doesn't roll on the thigh",
            "Fits in a bag for travel",
        ],
        howToUse:
            "Place around the legs above the knees or at the ankles as shown in your exercise sheet. Check for nicks before each use and replace a band that has torn.",
        materials:
            "Natural latex. Not for people with a latex allergy — ask for a fabric band.",
        ...KINETIQ,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: BANDS.map((b) =>
            v(
                b.title,
                `KQ-BL-${b.colour.toUpperCase().slice(0, 3)}`,
                b.onHand,
                3,
                b.price,
                demoAsset(bandFile(b.colour)),
            ),
        ),
        images: [P.bands],
        demand: 2.6,
        reviews: [
            r(
                5,
                "Harini V.",
                6,
                "Bought red and green for my clamshells. Much easier to do the exercises at home with the right strength.",
                "Green · Medium",
            ),
            r(
                4,
                "Rahul S.",
                39,
                "Good band. The yellow is very light, as expected for starting out.",
                "Yellow · Extra light",
            ),
            r(
                3,
                "Spoorthi B.",
                77,
                "Does the job but the red one started fraying at the edge after two months of daily use.",
                "Red · Light",
                "Sorry about that, Spoorthi — bring it in and we'll swap it. — Shruti",
            ),
        ],
    },
    {
        slug: "kinetiq-kinesiology-tape",
        name: "Kinetiq Kinesiology Tape, 5 cm × 5 m",
        category: "bands-tape",
        option: "colour",
        price: "399",
        mrp: "449",
        description:
            "Cotton elastic tape with a wave-pattern adhesive, the kind your physio uses in sessions. One roll is 5 cm wide and 5 m long, enough for several applications. The colours are the same tape — pick the one you like.",
        keyPoints: [
            "Stretches lengthwise like skin",
            "Water-resistant; lasts a few days",
            "Five colours, same tape",
            "Latex-free adhesive",
        ],
        howToUse:
            "Clean, dry, hair-free skin. Round the corners, peel the backing, and apply as your physio showed you — the middle stretched, the ends with no stretch. Rub to warm the glue. Remove slowly in the direction of hair growth.",
        materials: "Cotton 95%, elastane 5%, acrylic latex-free adhesive.",
        ...KINETIQ,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: TAPES.map((t) =>
            v(
                t.title,
                `KQ-KT-${t.title.toUpperCase().slice(0, 3)}`,
                t.onHand,
                3,
                null,
                demoAsset(tapeFile(t.title)),
            ),
        ),
        images: [P.tape, P.tape2],
        demand: 1.6,
        reviews: [
            r(
                5,
                "Chaitra N.",
                12,
                "Lasted four days on my knee including two runs. Beige doesn't show under office trousers.",
                "Beige",
            ),
            r(
                4,
                "Karthik R.",
                44,
                "Same tape they use at the clinic. Watching Dr. Ananya do it once helped a lot.",
                "Black",
            ),
        ],
    },
    {
        slug: "bodhi-foam-roller",
        name: "Bodhi Foam Roller",
        category: "recovery",
        option: "length",
        price: "599",
        mrp: "699",
        description:
            "A firm, closed-cell foam roller for the calves, thighs and upper back. The 30 cm travels; the 45 cm is the everyday size; the 90 cm lets you lie along it for upper-back and chest openers.",
        keyPoints: [
            "Firm EVA foam that keeps its shape",
            "Three lengths",
            "Wipe-clean surface",
        ],
        howToUse:
            "Roll slowly over the muscle, not the joint, for a minute or two; pause on a tight spot and breathe. It should feel like firm pressure, not sharp pain.",
        materials: "Closed-cell EVA foam.",
        ...BODHI,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: [
            v("30 cm", "BD-FR-30", 6, 2),
            v("45 cm", "BD-FR-45", 1, 2, "899"),
            v("90 cm", "BD-FR-90", 3, 1, "1299"),
        ],
        images: [P.roller, P.roller2],
        demand: 1.1,
        reviews: [
            r(
                5,
                "Ashwin K.",
                18,
                "My calves thank me after 10K training. The 45 cm is the right size for a flat.",
                "45 cm",
            ),
            r(
                4,
                "Meghana D.",
                52,
                "Firm. Took a week to get used to it on my IT band.",
                "90 cm",
            ),
        ],
    },
    {
        slug: "bodhi-massage-ball",
        name: "Bodhi Massage Ball, 6 cm",
        category: "recovery",
        option: null,
        price: "299",
        mrp: "299",
        description:
            "A firm 6 cm ball for the soles of the feet, the shoulder blade area against a wall, and the glutes. Small enough for a desk drawer.",
        keyPoints: [
            "Firm rubber, 6 cm",
            "Fits a desk drawer",
            "For feet, shoulders and hips",
        ],
        howToUse:
            "Roll under the foot while seated, or lean against a wall with the ball between the shoulder blade and spine. A minute or two at a time.",
        materials: "Natural rubber.",
        ...BODHI,
        gstRate: 0,
        hsnCode: "",
        stock: { onHand: 22, warnAt: 5 },
        variants: [],
        images: [P.ball, P.ball2],
        demand: 1.3,
        reviews: [
            r(
                5,
                "Sneha P.",
                25,
                "Rolling my foot under the desk has become a habit. Simple and works for me.",
            ),
        ],
    },
    {
        slug: "bodhi-exercise-mat",
        name: "Bodhi Exercise Mat, 6 mm",
        category: "home-exercise",
        option: null,
        price: "1199",
        mrp: "1399",
        description:
            "A 6 mm mat with a grippy top for floor exercises at home: bridges, clamshells, planks and stretches. Thick enough for the knees on a tiled floor, light enough to roll away after.",
        keyPoints: [
            "6 mm cushioning for tiled floors",
            "Non-slip on both sides",
            "183 × 61 cm",
        ],
        howToUse:
            "Wipe with a damp cloth after use and roll it with the top side out.",
        materials: "TPE foam, free of PVC.",
        ...BODHI,
        gstRate: 0,
        hsnCode: "",
        stock: { onHand: 5, warnAt: 3 },
        variants: [],
        images: [P.mat, P.mat2],
        demand: 0.6,
        reviews: [],
    },
    {
        slug: "kinetiq-vinyl-dumbbells",
        name: "Kinetiq Vinyl Dumbbells, Pair",
        category: "home-exercise",
        option: "weight",
        price: "499",
        mrp: "499",
        description:
            "A pair of vinyl-coated dumbbells for the shoulder and arm exercises in your home programme. Easy to hold and kind to the floor.",
        keyPoints: [
            "Sold as a pair",
            "Vinyl coating, won't scratch floors",
            "1, 2 or 3 kg each",
        ],
        howToUse:
            "Use the weight your physio sets; move up when the last repetitions feel easy.",
        materials: "Cast iron core, vinyl coating.",
        ...KINETIQ,
        gstRate: 0,
        hsnCode: "",
        stock: null,
        variants: [
            v("1 kg pair", "KQ-DB-1", 7, 2),
            v("2 kg pair", "KQ-DB-2", 4, 2, "799"),
            v("3 kg pair", "KQ-DB-3", 2, 2, "1099"),
        ],
        images: [P.dumbbell],
        demand: 0.7,
        reviews: [
            r(
                4,
                "Fatima A.",
                31,
                "1 kg pair for my shoulder rehab. Good grip, no smell.",
                "1 kg pair",
            ),
        ],
    },
];

export const MOTION_SWATCHES: DsSwatch[] = [
    ...BANDS.map((b): DsSwatch => ({
        file: bandFile(b.colour),
        kind: "band",
        hex: b.hex,
        title: b.colour,
        subtitle: `${b.strength} · Kinetiq Resistance Band Loop`,
    })),
    ...TAPES.map((t): DsSwatch => ({
        file: tapeFile(t.title),
        kind: "tape",
        hex: t.hex,
        title: t.title,
        subtitle: "Kinetiq Kinesiology Tape, 5 cm × 5 m",
    })),
];
