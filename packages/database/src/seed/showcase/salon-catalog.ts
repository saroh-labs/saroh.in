/**
 * Noor Salon & Bridal — the counter's retail catalogue and the site's photos.
 *
 * What a Jaipur salon sells at its desk: professional shampoos, conditioners,
 * masks, serums and oils (several in a 250 ml home size and a 1 L refill), a
 * few styling and men's products, one professional cream hair colour in 28
 * shades (sold for home root touch-ups after a consult and a patch test), one
 * nail lacquer in 18 shades, and a handful of brushes, combs and clips.
 *
 * Every brand and maker is invented (Kesar Lab, Aranya Botanics, Tarini
 * Professional, Sheesham Tools); no listing text is copied. Photographs are
 * free-licence Unsplash images, credited to their photographers and
 * hot-linked by address, each looked at before it was used. What a photo
 * cannot honestly show per variant — each hair-colour shade, each polish
 * shade, the two shade cards — is a generated image listed in
 * `NOOR_SWATCHES` and served from `demoAsset(...)`.
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

const SITE = "https://noor-salon.saroh.app";
const BUSINESS = "Noor Salon & Bridal";

const KESAR = {
    maker: "Kesar Lab Cosmetics Pvt. Ltd.",
    madeIn: "Ahmedabad, Gujarat",
};
const ARANYA = { maker: "Aranya Herbals LLP", madeIn: "Mysuru, Karnataka" };
const TARINI = {
    maker: "Tarini Colour Science Pvt. Ltd.",
    madeIn: "Baddi, Himachal Pradesh",
};
const SHEESHAM = {
    maker: "Sheesham Tools Co.",
    madeIn: "Saharanpur, Uttar Pradesh",
};

/** Every photograph used below, looked at before it was chosen. */
const P = {
    shampoo: {
        url: "https://images.unsplash.com/photo-1597931752949-98c74b5b159f?w=1600&q=80&auto=format&fit=crop",
        alt: "A plain white pump bottle of shampoo standing on folded brown linen",
        width: 1600,
        height: 2400,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    shampooB: {
        url: "https://images.unsplash.com/photo-1655892810227-c0cffe1d9717?w=1600&q=80&auto=format&fit=crop",
        alt: "A white pump bottle leaning against a pink wall in striped window light",
        width: 1600,
        height: 1067,
        creditName: "Andrzej Gdula",
        creditUrl: "https://unsplash.com/@andrzejgdula",
    },
    conditioner: {
        url: "https://images.unsplash.com/photo-1585232350744-974fc9804d65?w=1600&q=80&auto=format&fit=crop",
        alt: "A tall white pump bottle of conditioner on a plain white surface",
        width: 1600,
        height: 2400,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    colourProtect: {
        url: "https://images.unsplash.com/photo-1740327123574-05b0efdec29f?w=1600&q=80&auto=format&fit=crop",
        alt: "A dark pump bottle with a simple numbered label in warm side light",
        width: 1600,
        height: 1600,
        creditName: "Ela De Pure",
        creditUrl: "https://unsplash.com/@eladepure",
    },
    keratinShampoo: {
        url: "https://images.unsplash.com/photo-1655892817271-c66841c2506e?w=1600&q=80&auto=format&fit=crop",
        alt: "A white pump bottle on a dark tray with leaves and a glass soap dish",
        width: 1600,
        height: 1062,
        creditName: "Andrzej Gdula",
        creditUrl: "https://unsplash.com/@andrzejgdula",
    },
    antiDandruff: {
        url: "https://images.unsplash.com/photo-1574670700790-fa314ab37787?w=1600&q=80&auto=format&fit=crop",
        alt: "An amber glass bottle with a blank label on a dark mat",
        width: 1600,
        height: 2400,
        creditName: "Katrin Hauf",
        creditUrl: "https://unsplash.com/@trine",
    },
    volume: {
        url: "https://images.unsplash.com/photo-1707539159841-40a0db23ddc6?w=1600&q=80&auto=format&fit=crop",
        alt: "A blush-pink pump bottle on linen against a terracotta wall with palm shadows",
        width: 1600,
        height: 2400,
        creditName: "George Dagerotip",
        creditUrl: "https://unsplash.com/@dagerotip",
    },
    purple: {
        url: "https://images.unsplash.com/photo-1631390179103-56176154bc95?w=1600&q=80&auto=format&fit=crop",
        alt: "A violet glass bottle against a sage-green wall",
        width: 1600,
        height: 2344,
        creditName: "pmv chamara",
        creditUrl: "https://unsplash.com/@pmvch",
    },
    neem: {
        url: "https://images.unsplash.com/photo-1775126454577-4846f3e55cc5?w=1600&q=80&auto=format&fit=crop",
        alt: "A dark pump bottle of botanical shampoo beside a small amber dropper bottle",
        width: 1600,
        height: 2405,
        creditName: "Apothecary 87",
        creditUrl: "https://unsplash.com/@apothecary87",
    },
    mask: {
        url: "https://images.unsplash.com/photo-1763503839418-2b45c3d7a3c3?w=1600&q=80&auto=format&fit=crop",
        alt: "An open white jar of thick cream hair mask resting on a grey rock",
        width: 1600,
        height: 1600,
        creditName: "Eveling Salazar",
        creditUrl: "https://unsplash.com/@eve__3d",
    },
    mask2: {
        url: "https://images.unsplash.com/photo-1631438420064-8f1b2b52b2e6?w=1600&q=80&auto=format&fit=crop",
        alt: "An amber glass jar with a gold lid on a warm beige surface",
        width: 1600,
        height: 1067,
        creditName: "pmv chamara",
        creditUrl: "https://unsplash.com/@pmvch",
    },
    serum: {
        url: "https://images.unsplash.com/photo-1781344116880-029945a42b75?w=1600&q=80&auto=format&fit=crop",
        alt: "An amber dropper bottle with a white label on a stone plinth",
        width: 1600,
        height: 1067,
        creditName: "Avtar Singh",
        creditUrl: "https://unsplash.com/@avtar9w",
    },
    oil: {
        url: "https://images.unsplash.com/photo-1608571424634-58ae03e6edcf?w=1600&q=80&auto=format&fit=crop",
        alt: "A slim amber dropper bottle of oil on a turned wooden stand with leaf shadows",
        width: 1600,
        height: 2400,
        creditName: "Kadarius Seegars",
        creditUrl: "https://unsplash.com/@kseegars",
    },
    oil2: {
        url: "https://images.unsplash.com/photo-1655892836674-1df10277925e?w=1600&q=80&auto=format&fit=crop",
        alt: "A small amber dropper bottle of hair oil on a round wooden plate with pink flowers",
        width: 1600,
        height: 1067,
        creditName: "Andrzej Gdula",
        creditUrl: "https://unsplash.com/@andrzejgdula",
    },
    oil3: {
        url: "https://images.unsplash.com/photo-1669281393403-e1f3248dce2b?w=1600&q=80&auto=format&fit=crop",
        alt: "Three amber dropper bottles of scalp oil on a stone with palm leaves",
        width: 1600,
        height: 1280,
        creditName: "Lora Seis",
        creditUrl: "https://unsplash.com/@diasplora",
    },
    tonic: {
        url: "https://images.unsplash.com/photo-1550572017-4b7a301b9d81?w=1600&q=80&auto=format&fit=crop",
        alt: "A small clear spray bottle of scalp tonic on a grey background",
        width: 1600,
        height: 1253,
        creditName: "Brett Jordan",
        creditUrl: "https://unsplash.com/@brett_jordan",
    },
    heat: {
        url: "https://images.unsplash.com/photo-1632243575963-3143700087ed?w=1600&q=80&auto=format&fit=crop",
        alt: "A glass mist spray bottle with a black trigger by a window",
        width: 1600,
        height: 2397,
        creditName: "Lucas van Oort",
        creditUrl: "https://unsplash.com/@switch_dtp_fotografie",
    },
    dry: {
        url: "https://images.unsplash.com/photo-1707143598173-944230c2de24?w=1600&q=80&auto=format&fit=crop",
        alt: "Two amber glass spray bottles on a dark table",
        width: 1600,
        height: 2240,
        creditName: "Andrea Lacasse",
        creditUrl: "https://unsplash.com/@andrealacasse",
    },
    leavein: {
        url: "https://images.unsplash.com/photo-1712168044214-f5a272c23a5b?w=1600&q=80&auto=format&fit=crop",
        alt: "Two plain white cream tubes on a peach plinth",
        width: 1600,
        height: 2000,
        creditName: "Point Normal",
        creditUrl: "https://unsplash.com/@normals",
    },
    curl: {
        url: "https://images.unsplash.com/photo-1638609927040-8a7e97cd9d6a?w=1600&q=80&auto=format&fit=crop",
        alt: "A white tube of styling cream with a swirl of cream beside it",
        width: 1600,
        height: 1999,
        creditName: "Birgith Roosipuu",
        creditUrl: "https://unsplash.com/@msbirgith",
    },
    colour: {
        url: "https://images.unsplash.com/photo-1707720531504-ce087725861a?w=1600&q=80&auto=format&fit=crop",
        alt: "A colourist painting hair colour onto a section of hair over foil",
        width: 1600,
        height: 1067,
        creditName: "Ionela Mat",
        creditUrl: "https://unsplash.com/@ionelaaaaa",
    },
    developer: {
        url: "https://images.unsplash.com/photo-1617391654484-2894196c2cc9?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist in black gloves applying lightener to hair on foils",
        width: 1600,
        height: 1067,
        creditName: "Maksim Chernishev",
        creditUrl: "https://unsplash.com/@primipil",
    },
    bowl: {
        url: "https://images.unsplash.com/photo-1587225438173-701d7edc94f9?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist applying hair colour with a tint brush, holding the bowl",
        width: 1600,
        height: 1067,
        creditName: "Marília Castelli",
        creditUrl: "https://unsplash.com/@liacastelli",
    },
    beardoil: {
        url: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=1600&q=80&auto=format&fit=crop",
        alt: "Hands tipping a dropper of beard oil into a palm",
        width: 1600,
        height: 1067,
        creditName: "Christin Hume",
        creditUrl: "https://unsplash.com/@christinhumephoto",
    },
    beardoil2: {
        url: "https://images.unsplash.com/photo-1672761431764-61b8d9a00dbb?w=1600&q=80&auto=format&fit=crop",
        alt: "A bearded man running his fingers through his beard",
        width: 1600,
        height: 2000,
        creditName: "Lance Reis",
        creditUrl: "https://unsplash.com/@lancereis",
    },
    beardwash: {
        url: "https://images.unsplash.com/photo-1616750819574-7e38aa8046fa?w=1600&q=80&auto=format&fit=crop",
        alt: "A white tube of face wash on a blue surface with water drops",
        width: 1600,
        height: 1067,
        creditName: "Birgith Roosipuu",
        creditUrl: "https://unsplash.com/@msbirgith",
    },
    clay: {
        url: "https://images.unsplash.com/photo-1739979701278-a1a39e16da5a?w=1600&q=80&auto=format&fit=crop",
        alt: "A round jar of matte styling wax on a soft pink background",
        width: 1600,
        height: 2400,
        creditName: "Aleksandrs Karevs",
        creditUrl: "https://unsplash.com/@wowcontly",
    },
    nail: {
        url: "https://images.unsplash.com/photo-1667242197482-ffe672de74da?w=1600&q=80&auto=format&fit=crop",
        alt: "A row of nail lacquer bottles with white caps in many colours",
        width: 1600,
        height: 1067,
        creditName: "Maria Lupan",
        creditUrl: "https://unsplash.com/@luandmario",
    },
    basecoat: {
        url: "https://images.unsplash.com/photo-1640958903443-1e49d720650d?w=1600&q=80&auto=format&fit=crop",
        alt: "A bottle of nude nail lacquer with its brush laid beside it",
        width: 1600,
        height: 1067,
        creditName: "Gabriel Mihalcea",
        creditUrl: "https://unsplash.com/@lovelyscape",
    },
    remover: {
        url: "https://images.unsplash.com/photo-1644052024906-5c9ad358e341?w=1600&q=80&auto=format&fit=crop",
        alt: "Round cotton pads and a small bottle on a stone surface",
        width: 1600,
        height: 2133,
        creditName: "Miska Sage",
        creditUrl: "https://unsplash.com/@miskasage",
    },
    cuticle: {
        url: "https://images.unsplash.com/photo-1560521166-99f8bed834f5?w=1600&q=80&auto=format&fit=crop",
        alt: "A row of tiny amber glass bottles on a dark grey surface",
        width: 1600,
        height: 1067,
        creditName: "Kelly Sikkema",
        creditUrl: "https://unsplash.com/@kellysikkema",
    },
    paddle: {
        url: "https://images.unsplash.com/photo-1674566566071-1cee4f5263eb?w=1600&q=80&auto=format&fit=crop",
        alt: "A black paddle hair brush lying on a concrete surface",
        width: 1600,
        height: 1200,
        creditName: "Jamal Yaliyev",
        creditUrl: "https://unsplash.com/@jamalyaliyazul",
    },
    round: {
        url: "https://images.unsplash.com/photo-1734111719430-fe4a3973f8af?w=1600&q=80&auto=format&fit=crop",
        alt: "A round ceramic brush being used to blow-dry blonde hair",
        width: 1600,
        height: 2400,
        creditName: "Jenna Oslin",
        creditUrl: "https://unsplash.com/@jennaoslin",
    },
    comb: {
        url: "https://images.unsplash.com/photo-1774301844178-c9ce96b76d92?w=1600&q=80&auto=format&fit=crop",
        alt: "A carved wooden comb with hair scrunchies on a woven cloth",
        width: 1600,
        height: 1067,
        creditName: "Svitlanka Dlinnaya",
        creditUrl: "https://unsplash.com/@dlinnaya88",
    },
    tailcomb: {
        url: "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=1600&q=80&auto=format&fit=crop",
        alt: "A tail comb, paddle brush and other styling tools laid out on white",
        width: 1600,
        height: 919,
        creditName: "Shari Sirotnak",
        creditUrl: "https://unsplash.com/@sharisocial",
    },
    clip: {
        url: "https://images.unsplash.com/photo-1635423760085-e10fceef0756?w=1600&q=80&auto=format&fit=crop",
        alt: "A tortoiseshell claw clip on a white background",
        width: 1600,
        height: 1068,
        creditName: "12photostory",
        creditUrl: "https://unsplash.com/@12photography",
    },
} satisfies Record<string, DsImage>;

/* ------------------------------------------------------------------ */
/* Services and gallery                                                */
/* ------------------------------------------------------------------ */

export const NOOR_SERVICE_IMAGES: Record<string, DsImage> = {
    "cut-women": {
        url: "https://images.unsplash.com/photo-1711274094763-ff442e4719ef?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist cutting the ends of long, straight dark hair with scissors",
        width: 1600,
        height: 2400,
        creditName: "Daria Andriianova",
        creditUrl: "https://unsplash.com/@dimores",
    },
    "cut-men": {
        url: "https://images.unsplash.com/photo-1593702275687-f8b402bf1fb5?w=1600&q=80&auto=format&fit=crop",
        alt: "A barber cutting a man's hair with scissors and a comb",
        width: 1600,
        height: 1067,
        creditName: "Michael DeMoya",
        creditUrl: "https://unsplash.com/@demoya",
    },
    beard: {
        url: "https://images.unsplash.com/photo-1599011176306-4a96f1516d4d?w=1600&q=80&auto=format&fit=crop",
        alt: "A barber trimming a client's beard with scissors",
        width: 1600,
        height: 2400,
        creditName: "Mr Shave",
        creditUrl: "https://unsplash.com/@mrshave",
    },
    "cut-kids": {
        url: "https://images.unsplash.com/photo-1704072650662-76df3af134a7?w=1600&q=80&auto=format&fit=crop",
        alt: "A young boy in a cape sitting in a barber's chair",
        width: 1600,
        height: 2400,
        creditName: "Ibrahim guetar",
        creditUrl: "https://unsplash.com/@himo_beast1996",
    },
    blowdry: {
        url: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist blow-drying a client's hair with a round brush",
        width: 1600,
        height: 1068,
        creditName: "Adam Winger",
        creditUrl: "https://unsplash.com/@awcreativeut",
    },
    "hair-spa": {
        url: "https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?w=1600&q=80&auto=format&fit=crop",
        alt: "A client leaning back at a basin while her hair is washed",
        width: 1600,
        height: 1067,
        creditName: "Lindsay Cash",
        creditUrl: "https://unsplash.com/@lindsayrc81",
    },
    "root-touchup": {
        url: "https://images.unsplash.com/photo-1587225438173-701d7edc94f9?w=1600&q=80&auto=format&fit=crop",
        alt: "A colourist painting colour onto the roots with a tint brush, bowl in hand",
        width: 1600,
        height: 1067,
        creditName: "Marília Castelli",
        creditUrl: "https://unsplash.com/@liacastelli",
    },
    "global-colour": {
        url: "https://images.unsplash.com/photo-1712213396688-c6f2d536671f?w=1600&q=80&auto=format&fit=crop",
        alt: "A colourist applying colour with a brush over foil in a salon",
        width: 1600,
        height: 1067,
        creditName: "Ionela Mat",
        creditUrl: "https://unsplash.com/@ionelaaaaa",
    },
    highlights: {
        url: "https://images.unsplash.com/photo-1554519934-e32b1629d9ee?w=1600&q=80&auto=format&fit=crop",
        alt: "Long hair with soft blonde balayage, seen from behind in a salon",
        width: 1600,
        height: 2400,
        creditName: '"Jessie Dee" Dabrowski www.jessiedee.net',
        creditUrl: "https://unsplash.com/@jessiedeexx",
    },
    keratin: {
        url: "https://images.unsplash.com/photo-1758315949140-1972ace0644e?w=1600&q=80&auto=format&fit=crop",
        alt: "Long, glossy, straight brown hair falling past the shoulders",
        width: 1600,
        height: 2400,
        creditName: "masiha Olfi",
        creditUrl: "https://unsplash.com/@masihaolfi",
    },
    smoothening: {
        url: "https://images.unsplash.com/photo-1673465781892-6be0f7bca292?w=1600&q=80&auto=format&fit=crop",
        alt: "Long, sleek blonde hair after straightening, a client seated in the salon chair",
        width: 1600,
        height: 1068,
        creditName: "Adam Winger",
        creditUrl: "https://unsplash.com/@awcreativeut",
    },
    cleanup: {
        url: "https://images.unsplash.com/photo-1761718210089-ba3bb5ccb54f?w=1600&q=80&auto=format&fit=crop",
        alt: "A client with a cleansing mask on, during a facial at the salon",
        width: 1600,
        height: 2400,
        creditName: "kimia kazemi",
        creditUrl: "https://unsplash.com/@kimick",
    },
    "facial-hydrating": {
        url: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1600&q=80&auto=format&fit=crop",
        alt: "A therapist applying a white hydrating mask from a bowl",
        width: 1600,
        height: 1067,
        creditName: "engin akyurt",
        creditUrl: "https://unsplash.com/@enginakyurt",
    },
    "facial-brightening": {
        url: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1600&q=80&auto=format&fit=crop",
        alt: "A brush applying a brightening mask to a client's face",
        width: 1600,
        height: 1067,
        creditName: "Rosa Rafael",
        creditUrl: "https://unsplash.com/@rosarafael",
    },
    detan: {
        url: "https://images.unsplash.com/photo-1761718209708-9ab9ba1c7252?w=1600&q=80&auto=format&fit=crop",
        alt: "A client with a de-tan pack on, eyes closed, in a treatment room",
        width: 1600,
        height: 2400,
        creditName: "kimia kazemi",
        creditUrl: "https://unsplash.com/@kimick",
    },
    waxing: {
        url: "https://images.unsplash.com/photo-1677091508049-d8ae041b1582?w=1600&q=80&auto=format&fit=crop",
        alt: "A therapist stirring warm wax in a wax heater",
        width: 1600,
        height: 1067,
        creditName: "Grove Brands",
        creditUrl: "https://unsplash.com/@grovebrands",
    },
    threading: {
        url: "https://images.unsplash.com/photo-1519415387722-a1c3bbef716c?w=1600&q=80&auto=format&fit=crop",
        alt: "Eyebrows being shaped with a thread",
        width: 1600,
        height: 1068,
        creditName: "Rune Enstad",
        creditUrl: "https://unsplash.com/@runejohs",
    },
    manicure: {
        url: "https://images.unsplash.com/photo-1690749138086-7422f71dc159?w=1600&q=80&auto=format&fit=crop",
        alt: "A manicurist painting a client's nails at the nail table",
        width: 1600,
        height: 2844,
        creditName: "Pablo Escobar",
        creditUrl: "https://unsplash.com/@pabloescobar98",
    },
    pedicure: {
        url: "https://images.unsplash.com/photo-1519419451778-14599a49ec41?w=1600&q=80&auto=format&fit=crop",
        alt: "Feet soaking in a steel basin during a pedicure",
        width: 1600,
        height: 1068,
        creditName: "Rune Enstad",
        creditUrl: "https://unsplash.com/@runejohs",
    },
    "gel-polish": {
        url: "https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=1600&q=80&auto=format&fit=crop",
        alt: "A nail technician working on a client's nails beside a gel lamp",
        width: 1600,
        height: 1067,
        creditName: "Giorgio Trovato",
        creditUrl: "https://unsplash.com/@giorgiotrovato",
    },
    hairstyling: {
        url: "https://images.unsplash.com/photo-1581674210501-c760093514e8?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist pinning flowers into a soft, loose bridal hairstyle",
        width: 1600,
        height: 1067,
        creditName: "engin akyurt",
        creditUrl: "https://unsplash.com/@enginakyurt",
    },
    "party-makeup": {
        url: "https://images.unsplash.com/photo-1709477542170-f11ee7d471a0?w=1600&q=80&auto=format&fit=crop",
        alt: "A makeup artist applying eye makeup to a client",
        width: 1600,
        height: 2400,
        creditName: "LOLA AZIZADA",
        creditUrl: "https://unsplash.com/@kalpa_mahagamage",
    },
    "bridal-trial": {
        url: "https://images.unsplash.com/photo-1684868682581-4cac3af5b8d4?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride in a red lehenga and maang tikka, looking down, getting ready",
        width: 1600,
        height: 2405,
        creditName: "gurpreet singh",
        creditUrl: "https://unsplash.com/@ajay_gill8054",
    },
    "engagement-makeup": {
        url: "https://images.unsplash.com/photo-1600685890506-593fdf55949b?w=1600&q=80&auto=format&fit=crop",
        alt: "A smiling bride in a pink lehenga and jewellery",
        width: 1600,
        height: 2398,
        creditName: "Aayush(gop) Rawat",
        creditUrl: "https://unsplash.com/@aayushrawat",
    },
    "bridal-makeup": {
        url: "https://images.unsplash.com/photo-1684868268327-7e5590bcfbd6?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride in red with a nath and full bridal makeup",
        width: 1600,
        height: 2405,
        creditName: "gurpreet singh",
        creditUrl: "https://unsplash.com/@ajay_gill8054",
    },
    "party-mehendi": {
        url: "https://images.unsplash.com/photo-1630833944682-b8b4569eb039?w=1600&q=80&auto=format&fit=crop",
        alt: "A mehendi artist drawing a pattern on a hand with a cone",
        width: 1600,
        height: 1067,
        creditName: "Sibeesh Venu",
        creditUrl: "https://unsplash.com/@sibeeshvenu",
    },
    "bridal-mehendi": {
        url: "https://images.unsplash.com/photo-1588175768004-4e8a770cc099?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride's hands covered in fine bridal mehendi, held out with gold bangles",
        width: 1600,
        height: 2398,
        creditName: "Archee Lal",
        creditUrl: "https://unsplash.com/@vrchh",
    },
};

export const NOOR_GALLERY: DsImage[] = [
    {
        url: "https://images.unsplash.com/photo-1626383137804-ff908d2753a2?w=1600&q=80&auto=format&fit=crop",
        alt: "A long salon floor with black styling chairs, mirrors and retail shelves",
        width: 1600,
        height: 1067,
        creditName: "Giorgio Trovato",
        creditUrl: "https://unsplash.com/@giorgiotrovato",
    },
    {
        url: "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist smiling as she blow-dries a client's bob",
        width: 1600,
        height: 1068,
        creditName: "Adam Winger",
        creditUrl: "https://unsplash.com/@awcreativeut",
    },
    {
        url: "https://images.unsplash.com/photo-1610173827043-9db50e0d8ef9?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride in pink and gold with bridal jewellery, eyes lowered",
        width: 1600,
        height: 2400,
        creditName: "Alok Verma",
        creditUrl: "https://unsplash.com/@theweddingfocus",
    },
    {
        url: "https://images.unsplash.com/photo-1771992228898-79342c9c1c39?w=1600&q=80&auto=format&fit=crop",
        alt: "Hands with dark bridal mehendi holding marigold garlands",
        width: 1600,
        height: 1067,
        creditName: "Rejaul Karim",
        creditUrl: "https://unsplash.com/@rejaul_creativedesign",
    },
    {
        url: "https://images.unsplash.com/photo-1785456283212-338f5bc44d50?w=1600&q=80&auto=format&fit=crop",
        alt: "Two women seen from behind with honey and blonde balayage",
        width: 1600,
        height: 1600,
        creditName: "Yovanka Loria Salon",
        creditUrl: "https://unsplash.com/@yovankaloriasalon",
    },
    {
        url: "https://images.unsplash.com/photo-1746723378067-83a345ff3160?w=1600&q=80&auto=format&fit=crop",
        alt: "A bright salon reception with shelves of hair care",
        width: 1600,
        height: 1067,
        creditName: "SumUp",
        creditUrl: "https://unsplash.com/@sumup",
    },
    {
        url: "https://images.unsplash.com/photo-1612887390768-fb02affea7a6?w=1600&q=80&auto=format&fit=crop",
        alt: "Pale pink manicured nails against a white towel",
        width: 1600,
        height: 2133,
        creditName: "Jodene Isakowitz",
        creditUrl: "https://unsplash.com/@jojobean24",
    },
    {
        url: "https://images.unsplash.com/photo-1629332791370-77208e6cbb67?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride's mehendi-covered hands holding sweets over her lehenga",
        width: 1600,
        height: 898,
        creditName: "Graphe Tween",
        creditUrl: "https://unsplash.com/@graphetween",
    },
];

/* ------------------------------------------------------------------ */
/* Shades                                                              */
/* ------------------------------------------------------------------ */

/** Tarini Pro Cream Colour: level.tone numbers as printed on the tube. */
const HAIR_SHADES = [
    { n: "1.0", name: "Black", hex: "#1b1714", onHand: 14, warnAt: 4 },
    { n: "1.1", name: "Blue Black", hex: "#15171d", onHand: 6, warnAt: 3 },
    { n: "2.0", name: "Darkest Brown", hex: "#241b17", onHand: 12, warnAt: 4 },
    { n: "3.0", name: "Dark Brown", hex: "#2f231d", onHand: 16, warnAt: 4 },
    { n: "4.0", name: "Medium Brown", hex: "#45322a", onHand: 2, warnAt: 4 },
    { n: "4.15", name: "Iced Chocolate", hex: "#4a3a33", onHand: 6, warnAt: 3 },
    { n: "4.5", name: "Mahogany Brown", hex: "#4d2a24", onHand: 9, warnAt: 3 },
    { n: "4.62", name: "Burgundy", hex: "#4f1d24", onHand: 8, warnAt: 3 },
    { n: "5.0", name: "Light Brown", hex: "#5b4232", onHand: 11, warnAt: 4 },
    {
        n: "5.3",
        name: "Light Golden Brown",
        hex: "#66472c",
        onHand: 7,
        warnAt: 3,
    },
    { n: "5.35", name: "Chocolate", hex: "#5a3b2a", onHand: 10, warnAt: 3 },
    {
        n: "5.4",
        name: "Light Copper Brown",
        hex: "#6b3a24",
        onHand: 5,
        warnAt: 3,
    },
    {
        n: "5.62",
        name: "Light Burgundy Brown",
        hex: "#6a2430",
        onHand: 5,
        warnAt: 3,
    },
    { n: "5.66", name: "Intense Red", hex: "#7a1f22", onHand: 4, warnAt: 3 },
    { n: "6.0", name: "Dark Blonde", hex: "#745a45", onHand: 7, warnAt: 3 },
    {
        n: "6.3",
        name: "Dark Golden Blonde",
        hex: "#85633d",
        onHand: 6,
        warnAt: 3,
    },
    {
        n: "6.34",
        name: "Golden Copper Blonde",
        hex: "#8a5a33",
        onHand: 4,
        warnAt: 2,
    },
    {
        n: "6.4",
        name: "Dark Copper Blonde",
        hex: "#8b4a2b",
        onHand: 5,
        warnAt: 2,
    },
    {
        n: "6.45",
        name: "Copper Mahogany",
        hex: "#7e3d2a",
        onHand: 3,
        warnAt: 2,
    },
    { n: "7.0", name: "Blonde", hex: "#92765b", onHand: 5, warnAt: 2 },
    { n: "7.1", name: "Ash Blonde", hex: "#8d8172", onHand: 4, warnAt: 2 },
    { n: "7.3", name: "Golden Blonde", hex: "#a07b4c", onHand: 4, warnAt: 2 },
    { n: "7.4", name: "Copper Blonde", hex: "#a85e33", onHand: 3, warnAt: 2 },
    {
        n: "7.44",
        name: "Intense Copper Blonde",
        hex: "#b1572a",
        onHand: 0,
        warnAt: 2,
    },
    { n: "8.0", name: "Light Blonde", hex: "#ae9474", onHand: 3, warnAt: 2 },
    {
        n: "8.1",
        name: "Light Ash Blonde",
        hex: "#a99d8a",
        onHand: 3,
        warnAt: 2,
    },
    {
        n: "8.3",
        name: "Light Golden Blonde",
        hex: "#bb9a64",
        onHand: 4,
        warnAt: 2,
    },
    {
        n: "9.0",
        name: "Very Light Blonde",
        hex: "#c6ad8a",
        onHand: 1,
        warnAt: 1,
    },
] as const;

/** Tarini Nail Lacquer, 9 ml. */
const NAIL_SHADES = [
    { name: "Classic Red", hex: "#b0161e", onHand: 1, warnAt: 3 },
    { name: "Sindoor", hex: "#c4271f", onHand: 9, warnAt: 3 },
    { name: "Rani Pink", hex: "#d6246e", onHand: 8, warnAt: 3 },
    { name: "Gulabi Blush", hex: "#e8a3b0", onHand: 10, warnAt: 3 },
    { name: "Nude Chai", hex: "#c9a088", onHand: 12, warnAt: 3 },
    { name: "Mauve Dusk", hex: "#9d6b7a", onHand: 7, warnAt: 3 },
    { name: "Marsala", hex: "#6e2a2e", onHand: 9, warnAt: 3 },
    { name: "Wine", hex: "#4f1625", onHand: 6, warnAt: 3 },
    { name: "Coral Sunset", hex: "#f0624d", onHand: 5, warnAt: 2 },
    { name: "Mango Lassi", hex: "#f5a43a", onHand: 4, warnAt: 2 },
    { name: "Haldi", hex: "#e2b221", onHand: 0, warnAt: 2 },
    { name: "Peacock Teal", hex: "#0f6f73", onHand: 5, warnAt: 2 },
    { name: "Mehendi Green", hex: "#5b6b2e", onHand: 4, warnAt: 2 },
    { name: "Neelam Blue", hex: "#1f3a8a", onHand: 5, warnAt: 2 },
    { name: "Lavender Haze", hex: "#b9a3d6", onHand: 6, warnAt: 2 },
    { name: "Cocoa", hex: "#4a2c22", onHand: 5, warnAt: 2 },
    { name: "Jet Black", hex: "#121212", onHand: 7, warnAt: 2 },
    { name: "Milky White", hex: "#f3eee7", onHand: 8, warnAt: 2 },
] as const;

const kebab = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

const hairTitle = (s: (typeof HAIR_SHADES)[number]) => `${s.n} ${s.name}`;
const hairFile = (s: (typeof HAIR_SHADES)[number]) =>
    `noor/colour-${kebab(s.n)}.png`;
const nailFile = (s: (typeof NAIL_SHADES)[number]) =>
    `noor/nail-${kebab(s.name)}.png`;

const HAIR_CARD = "noor/colour-shade-card.png";
const NAIL_CARD = "noor/nail-shade-card.png";

/* ------------------------------------------------------------------ */
/* Categories and options                                              */
/* ------------------------------------------------------------------ */

export const NOOR_CATEGORIES: { key: string; name: string }[] = [
    { key: "hair-care", name: "Shampoo & conditioner" },
    { key: "treatments", name: "Masks, serums & oils" },
    { key: "styling", name: "Styling" },
    { key: "colour", name: "Hair colour" },
    { key: "mens", name: "Men's grooming" },
    { key: "nails", name: "Nails" },
    { key: "tools", name: "Brushes, combs & clips" },
];

export const NOOR_OPTIONS: { key: string; name: string; values: string[] }[] = [
    {
        key: "size",
        name: "Size",
        values: [
            "50 ml",
            "100 ml",
            "200 ml",
            "250 ml",
            "1 L",
            "200 g",
            "500 g",
        ],
    },
    {
        key: "shade",
        name: "Shade",
        values: HAIR_SHADES.map(hairTitle),
    },
    {
        key: "nail-shade",
        name: "Shade",
        values: NAIL_SHADES.map((s) => s.name),
    },
    {
        key: "coat",
        name: "Coat",
        values: ["Base coat", "Top coat"],
    },
    {
        key: "barrel",
        name: "Barrel",
        values: ["25 mm", "33 mm", "43 mm"],
    },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function v(
    title: string,
    sku: string,
    onHand: number,
    warnAt: number,
    price: string | null = null,
    mrp: string | null = null,
    imageIndex: number | null = null,
): DsVariant {
    return { title, sku, price, mrp, stock: { onHand, warnAt }, imageIndex };
}

function r(
    rating: number,
    displayName: string,
    daysAgo: number,
    body: string,
    variantTitle: string | null = null,
    reply: string | null = null,
): DsReview {
    return { rating, body, displayName, variantTitle, daysAgo, reply };
}

const card = (file: string, alt: string, landscape = true): DsImage => ({
    url: demoAsset(file),
    alt,
    width: landscape ? 1600 : 1200,
    height: landscape ? 1000 : 1200,
    creditName: BUSINESS,
    creditUrl: SITE,
});

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export const NOOR_PRODUCTS: DsProduct[] = [
    /* ---------------- Shampoo & conditioner ---------------- */
    {
        slug: "kesar-lab-moisture-repair-shampoo",
        name: "Kesar Lab Moisture Repair Shampoo",
        category: "hair-care",
        option: "size",
        price: "650",
        mrp: "650",
        description:
            "The shampoo we use at the backwash for dry, frizzy and chemically treated hair. A mild cleanser with glycerin, panthenol and a little argan oil, so hair comes out soft rather than squeaky, even in hard Jaipur water.\n\nThe 250 ml bottle lasts most people about six weeks; the 1 L refill is what families and long-hair clients take home.",
        keyPoints: [
            "Gentle cleansing for dry, frizzy and coloured hair",
            "Glycerin, panthenol and argan oil for softness",
            "Lathers well in hard water",
            "1 L refill with a pump, better value per wash",
        ],
        howToUse:
            "Massage a coin-sized amount into wet scalp, work through the lengths and rinse. Repeat if you use oil the night before. Follow with the Moisture Repair Conditioner.",
        materials:
            "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Panthenol, Argania Spinosa Kernel Oil, Polyquaternium-10, Sodium Chloride, Citric Acid, Fragrance, Sodium Benzoate.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("250 ml", "KL-MRS-250", 18, 5),
            v("1 L", "KL-MRS-1L", 2, 3, "1850", "1850"),
        ],
        images: [P.shampoo, P.shampooB],
        demand: 3,
        reviews: [
            r(
                5,
                "Meera K.",
                11,
                "My hair is long and goes like straw after Holi and every summer. Kavya suggested this after my spa and it actually keeps the ends soft till the next wash.",
                "250 ml",
                "So glad, Meera! Use the conditioner only on the lengths and it lasts even longer. — Kavya",
            ),
            r(
                4,
                "Rashmi A.",
                34,
                "Good shampoo, lathers nicely. The 1 L pump bottle is much better value for the three of us at home. Fragrance is a bit strong for my taste.",
                "1 L",
            ),
            r(
                5,
                "Nidhi J.",
                58,
                "Second bottle. Frizz is much less in the monsoon than with my supermarket shampoo.",
                "250 ml",
            ),
        ],
    },
    {
        slug: "kesar-lab-moisture-repair-conditioner",
        name: "Kesar Lab Moisture Repair Conditioner",
        category: "hair-care",
        option: "size",
        price: "700",
        mrp: "700",
        description:
            "A rich conditioner for the lengths and ends of dry hair. Shea butter and a light silicone smooth the cuticle so hair detangles easily and blow-dries with less frizz.\n\nKeep it off the scalp if you are oily at the roots.",
        keyPoints: [
            "Detangles long and thick hair",
            "Shea butter for dry, rough ends",
            "Smoother blow-dry, less frizz",
            "250 ml or a 1 L refill",
        ],
        howToUse:
            "After shampoo, squeeze out excess water and comb a palmful through mid-lengths to ends. Leave 2–3 minutes and rinse with cool water.",
        materials:
            "Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Butyrospermum Parkii Butter, Amodimethicone, Glycerin, Panthenol, Fragrance, Phenoxyethanol, Citric Acid.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("250 ml", "KL-MRC-250", 14, 5),
            v("1 L", "KL-MRC-1L", 6, 3, "1950", "1950"),
        ],
        images: [P.conditioner],
        demand: 2.2,
        reviews: [],
    },
    {
        slug: "kesar-lab-colour-protect-shampoo",
        name: "Kesar Lab Colour Protect Shampoo, Sulphate-Free",
        category: "hair-care",
        option: "size",
        price: "720",
        mrp: "720",
        description:
            "A sulphate-free shampoo for coloured and highlighted hair. It cleans with milder surfactants so colour washes out more slowly, and a UV filter helps against the Rajasthan sun.\n\nWe recommend it for the first six weeks after any global colour, highlights or balayage at the salon.",
        keyPoints: [
            "Sulphate-free, gentle on colour",
            "Helps colour and highlights last longer",
            "UV filter for sunny days",
            "Safe after keratin and smoothening too",
        ],
        howToUse:
            "Wash with lukewarm, not hot, water. Massage into the scalp, rinse, and follow with Colour Protect Conditioner. Wait 48 hours after a colour service before your first wash.",
        materials:
            "Aqua, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Decyl Glucoside, Glycerin, Hydrolyzed Wheat Protein, Benzophenone-4, Polyquaternium-7, Citric Acid, Fragrance, Sodium Benzoate.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("250 ml", "KL-CPS-250", 15, 5),
            v("1 L", "KL-CPS-1L", 5, 3, "2050", "2050"),
        ],
        images: [P.colourProtect],
        demand: 2.4,
        reviews: [
            r(
                5,
                "Aditi S.",
                19,
                "Got balayage done with Tanvi and she told me to switch to this. Six weeks later the caramel is still warm, not brassy. Worth it.",
                "250 ml",
                "Lovely to hear, Aditi. See you for a toner at the 8–10 week mark! — Noor",
            ),
            r(
                4,
                "Priyanka G.",
                43,
                "Does not foam as much as normal shampoo so I use a little more. Hair feels clean though, and my burgundy has lasted.",
                "250 ml",
            ),
        ],
    },
    {
        slug: "kesar-lab-colour-protect-conditioner",
        name: "Kesar Lab Colour Protect Conditioner",
        category: "hair-care",
        option: "size",
        price: "760",
        mrp: "760",
        description:
            "The partner to Colour Protect Shampoo: a light, slightly acidic conditioner that closes the cuticle after washing so colour stays in and shine stays up. Light enough for fine hair.",
        keyPoints: [
            "Low-pH formula seals the cuticle",
            "Light enough for fine hair",
            "Adds shine to coloured hair",
        ],
        howToUse:
            "After shampoo, apply to mid-lengths and ends, leave 2 minutes, rinse with cool water.",
        materials:
            "Aqua, Cetearyl Alcohol, Behentrimonium Methosulfate, Glycerin, Hydrolyzed Rice Protein, Lactic Acid, Benzophenone-4, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("250 ml", "KL-CPC-250", 12, 4),
            v("1 L", "KL-CPC-1L", 4, 2, "2150", "2150"),
        ],
        images: [P.shampooB],
        demand: 1.6,
        reviews: [],
    },
    {
        slug: "kesar-lab-keratin-aftercare-shampoo",
        name: "Kesar Lab Keratin Aftercare Shampoo, Sulphate-Free",
        category: "hair-care",
        option: "size",
        price: "850",
        mrp: "850",
        description:
            "A sulphate- and salt-free shampoo made for hair that has had a keratin treatment or smoothening. Harsh sulphates and salt strip the treatment faster, so this one cleans with mild surfactants and adds a little hydrolysed keratin back.\n\nUsed with the Keratin Aftercare Mask, most clients get the full four to five months out of their treatment.",
        keyPoints: [
            "Sulphate-free and salt-free",
            "Made for keratin-treated and smoothened hair",
            "Hydrolysed keratin and silk protein",
            "Helps the treatment last its full life",
        ],
        howToUse:
            "Wait 72 hours after your treatment before the first wash. Then wash 2–3 times a week with lukewarm water and follow with the Keratin Aftercare Mask or a light conditioner.",
        materials:
            "Aqua, Sodium Lauroyl Methyl Isethionate, Cocamidopropyl Betaine, Lauryl Glucoside, Hydrolyzed Keratin, Hydrolyzed Silk, Glycerin, Polyquaternium-10, Citric Acid, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("250 ml", "KL-KAS-250", 11, 4),
            v("1 L", "KL-KAS-1L", 3, 2, "2400", "2400"),
        ],
        images: [P.keratinShampoo],
        demand: 2,
        reviews: [
            r(
                5,
                "Sneha T.",
                23,
                "Had keratin with Kavya in July. Using only this and my hair is still straight and manageable almost three months later, even through the rains.",
                "250 ml",
                "That's exactly what we hope for, Sneha. Thank you! — Kavya",
            ),
            r(
                3,
                "Ritu B.",
                61,
                "It works, but it is expensive for a shampoo and I needed two washes when I had oiled my hair. The 1 L is better value.",
                "250 ml",
                "Fair point, Ritu. On oil days, a small first wash and then a second one usually does it. The 1 L does bring the cost per wash down. — Noor",
            ),
            r(
                4,
                "Fatima Z.",
                40,
                "Gentle, smells clean. My smoothening is holding well.",
                "1 L",
            ),
        ],
    },
    {
        slug: "kesar-lab-anti-dandruff-scalp-shampoo",
        name: "Kesar Lab Clear Scalp Anti-Dandruff Shampoo",
        category: "hair-care",
        option: "size",
        price: "620",
        mrp: "620",
        description:
            "A scalp-first shampoo with piroctone olamine and a touch of menthol for flaking and itch. It is mild enough for regular use and does not leave the lengths rough.\n\nIf flaking does not ease in four weeks, or your scalp is sore or red, please see a dermatologist.",
        keyPoints: [
            "Piroctone olamine for visible flakes",
            "Cooling menthol for an itchy scalp",
            "Mild enough for 2–3 washes a week",
        ],
        howToUse:
            "Massage into the scalp, leave on for 2 minutes, rinse well. Use 2–3 times a week; conditioner on the lengths only.",
        materials:
            "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Piroctone Olamine (0.5%), Menthol, Glycerin, Polyquaternium-10, Sodium Chloride, Fragrance, Sodium Benzoate.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("250 ml", "KL-CSS-250", 10, 4),
            v("1 L", "KL-CSS-1L", 4, 2, "1750", "1750"),
        ],
        images: [P.antiDandruff],
        demand: 1.5,
        reviews: [
            r(
                4,
                "Arjun M.",
                16,
                "Imran recommended this after my haircut. Flakes have reduced a lot in three weeks. Menthol is strong in the first few seconds but fine.",
                "250 ml",
            ),
        ],
    },
    {
        slug: "kesar-lab-volume-shampoo",
        name: "Kesar Lab Volume Shampoo for Fine Hair",
        category: "hair-care",
        option: null,
        price: "640",
        mrp: "640",
        description:
            "A light, clear shampoo for fine and flat hair. No heavy oils or butters, so roots stay lifted for longer after a blow-dry.",
        keyPoints: [
            "Weightless clean for fine hair",
            "More lift at the roots",
            "No heavy oils or butters",
        ],
        howToUse: "Shampoo as usual. Use a light conditioner only on the ends.",
        materials:
            "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Hydrolyzed Wheat Protein, Panthenol, Glycerin, Sodium Chloride, Fragrance, Sodium Benzoate.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 9, warnAt: 3 },
        variants: [],
        images: [P.volume],
        demand: 0.9,
        reviews: [],
    },
    {
        slug: "kesar-lab-purple-toning-shampoo",
        name: "Kesar Lab Purple Toning Shampoo",
        category: "hair-care",
        option: null,
        price: "780",
        mrp: "780",
        description:
            "A violet-tinted shampoo that cancels yellow and orange tones in highlighted, balayaged or grey hair. Use it once a week in place of your usual shampoo, not every wash.\n\nOn very light blonde it can leave a slight lilac tint if left on too long; start with one minute.",
        keyPoints: [
            "Violet pigment neutralises brassiness",
            "For highlights, balayage and grey hair",
            "Use once a week",
        ],
        howToUse:
            "Wear gloves. Apply to wet hair, leave 1–3 minutes, rinse well. Follow with conditioner.",
        materials:
            "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Polyquaternium-10, Acid Violet 43, Basic Blue 99, Citric Acid, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 6, warnAt: 2 },
        variants: [],
        images: [P.purple],
        demand: 0.7,
        reviews: [
            r(
                5,
                "Ishita P.",
                27,
                "Tanvi told me one minute only and she was right, two minutes and my ash highlights went slightly lilac. One minute is perfect.",
                null,
                "Ha, yes! One minute once a week is plenty for your shade. — Tanvi",
            ),
        ],
    },
    {
        slug: "aranya-neem-tea-tree-shampoo",
        name: "Aranya Neem & Tea Tree Scalp Shampoo",
        category: "hair-care",
        option: null,
        price: "480",
        mrp: "520",
        description:
            "An everyday shampoo for oily scalps from Aranya Botanics, with neem leaf extract, tea tree oil and a mild coconut-based cleanser. Fresh, herbal smell; good for the sticky months between May and September.",
        keyPoints: [
            "Neem and tea tree for an oily scalp",
            "Coconut-based cleansers",
            "Fresh herbal fragrance",
        ],
        howToUse:
            "Massage into wet scalp, leave a minute, rinse. Safe for daily use.",
        materials:
            "Aqua, Sodium Cocoyl Glutamate, Coco-Glucoside, Azadirachta Indica Leaf Extract, Melaleuca Alternifolia Leaf Oil, Aloe Barbadensis Leaf Juice, Glycerin, Citric Acid, Sodium Benzoate.",
        ...ARANYA,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 13, warnAt: 4 },
        variants: [],
        images: [P.neem],
        demand: 1.1,
        reviews: [],
    },

    /* ---------------- Masks, serums & oils ---------------- */
    {
        slug: "kesar-lab-keratin-aftercare-mask",
        name: "Kesar Lab Keratin Aftercare Mask",
        category: "treatments",
        option: "size",
        price: "950",
        mrp: "950",
        description:
            "A weekly mask for keratin-treated and smoothened hair. Sulphate- and salt-free like the aftercare shampoo, with hydrolysed keratin, shea butter and a light silicone for slip and shine.",
        keyPoints: [
            "Weekly treatment for keratin and smoothening",
            "Shea butter and hydrolysed keratin",
            "Salt-free",
        ],
        howToUse:
            "Once a week after shampoo, apply to lengths, comb through, leave 5–10 minutes and rinse.",
        materials:
            "Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Butyrospermum Parkii Butter, Hydrolyzed Keratin, Amodimethicone, Glycerin, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("200 g", "KL-KAM-200", 8, 3),
            v("500 g", "KL-KAM-500", 3, 2, "1900", "1900"),
        ],
        images: [P.mask],
        demand: 1.2,
        reviews: [],
    },
    {
        slug: "kesar-lab-deep-repair-mask",
        name: "Kesar Lab Deep Repair Hair Mask",
        category: "treatments",
        option: "size",
        price: "890",
        mrp: "990",
        description:
            "Our home hair spa. A thick cream mask with ceramides, argan oil and wheat protein for hair that is dry, porous or breaking from heat and colour. It is the same family of mask Pooja and Kavya use in the salon's hair spa.",
        keyPoints: [
            "Ceramides and wheat protein for damaged hair",
            "Argan oil for softness and shine",
            "A salon-style hair spa at home",
        ],
        howToUse:
            "Once a week, after shampoo, apply generously to lengths. Cover with a warm towel or shower cap for 10–15 minutes, then rinse.",
        materials:
            "Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Argania Spinosa Kernel Oil, Ceramide NP, Hydrolyzed Wheat Protein, Glycerin, Dimethicone, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("200 g", "KL-DRM-200", 12, 4),
            v("500 g", "KL-DRM-500", 5, 2, "1650", "1750"),
        ],
        images: [P.mask2],
        demand: 1.4,
        reviews: [
            r(
                5,
                "Kritika D.",
                9,
                "Can't come in for a hair spa every month so I do this on Sundays. Hair is soft for the whole week.",
                "500 g",
            ),
            r(
                4,
                "Shalini V.",
                52,
                "Very nice mask, a little goes a long way. Wish it came in a pump or tube, scooping from a tub with wet hands is messy.",
                "200 g",
                "Thanks Shalini, we've passed that on to the brand. Meanwhile a small spatula helps! — Kavya",
            ),
        ],
    },
    {
        slug: "kesar-lab-smooth-finish-serum",
        name: "Kesar Lab Smooth Finish Hair Serum",
        category: "treatments",
        option: "size",
        price: "550",
        mrp: "550",
        description:
            "A light silicone serum with argan oil for frizz and flyaways. A drop or two on damp hair before blow-drying or on dry ends to finish. It doesn't feel greasy if you keep to the amount.",
        keyPoints: [
            "Tames frizz and flyaways",
            "Adds shine without grease",
            "Use on damp or dry hair",
            "Glass bottle with a pump",
        ],
        howToUse:
            "Pump 1–2 drops into palms, rub together and smooth over mid-lengths and ends. Keep away from the roots.",
        materials:
            "Cyclopentasiloxane, Dimethiconol, Argania Spinosa Kernel Oil, Tocopheryl Acetate, Fragrance.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("50 ml", "KL-SFS-50", 3, 4),
            v("100 ml", "KL-SFS-100", 10, 3, "950", "950"),
        ],
        images: [P.serum],
        demand: 2.6,
        reviews: [
            r(
                5,
                "Anjali R.",
                6,
                "This is the serum Riya used on my blow-dry. One pump and my hair stays smooth all day, even in the humidity.",
                "50 ml",
            ),
            r(
                5,
                "Neha C.",
                30,
                "Small bottle lasts me three months. No greasy roots.",
                "50 ml",
            ),
            r(
                4,
                "Pallavi S.",
                71,
                "Good serum. I take the 100 ml now, cheaper per ml.",
                "100 ml",
            ),
        ],
    },
    {
        slug: "kesar-lab-argan-light-hair-oil",
        name: "Kesar Lab Argan Light Hair Oil",
        category: "treatments",
        option: null,
        price: "890",
        mrp: "890",
        description:
            "A dry-touch oil of argan, jojoba and a little camellia, for shine and softness without the heaviness of a traditional champi oil. Use a few drops on dry ends or as an overnight treatment.",
        keyPoints: [
            "Argan, jojoba and camellia oils",
            "Absorbs fast, light finish",
            "For shine on dry ends or overnight care",
        ],
        howToUse:
            "Warm 3–4 drops in your palms and smooth over dry ends. As an overnight treatment, use a little more on the lengths and wash in the morning.",
        materials:
            "Argania Spinosa Kernel Oil, Simmondsia Chinensis Seed Oil, Camellia Oleifera Seed Oil, Caprylic/Capric Triglyceride, Tocopherol, Fragrance.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 8, warnAt: 3 },
        variants: [],
        images: [P.oil],
        demand: 1,
        reviews: [],
    },
    {
        slug: "aranya-bhringraj-amla-hair-oil",
        name: "Aranya Bhringraj & Amla Hair Oil",
        category: "treatments",
        option: "size",
        price: "340",
        mrp: "340",
        description:
            "A traditional oil for a weekly champi: cold-pressed coconut and sesame oils infused with bhringraj, amla and brahmi. Warm a little, massage into the scalp the night before you wash.",
        keyPoints: [
            "Bhringraj, amla and brahmi in coconut and sesame oils",
            "For a relaxing weekly scalp massage",
            "No mineral oil",
        ],
        howToUse:
            "Warm 2 tablespoons (stand the bottle in warm water). Part the hair and massage into the scalp for 5 minutes. Leave overnight and wash with a mild shampoo; you may need two washes.",
        materials:
            "Cocos Nucifera Oil, Sesamum Indicum Seed Oil, Eclipta Alba Extract, Emblica Officinalis Fruit Extract, Bacopa Monnieri Extract, Tocopherol.",
        ...ARANYA,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: [
            v("100 ml", "AR-BAO-100", 16, 4),
            v("200 ml", "AR-BAO-200", 9, 3, "620", "640"),
        ],
        images: [P.oil2],
        demand: 1.3,
        reviews: [
            r(
                4,
                "Sunita S.",
                38,
                "Reminds me of the oil my nani made. Smells of amla, not perfume. I'd like a bigger bottle.",
                "200 ml",
            ),
            r(
                5,
                "Komal Y.",
                74,
                "Using it for my daughter and me. Head massage on Saturday nights is now a ritual.",
                "100 ml",
            ),
        ],
    },
    {
        slug: "aranya-rosemary-methi-scalp-oil",
        name: "Aranya Rosemary & Methi Scalp Oil",
        category: "treatments",
        option: null,
        price: "450",
        mrp: "450",
        description:
            "A lighter scalp oil with fenugreek (methi) seed infused in sesame oil, plus rosemary and peppermint. For people who like a scalp massage but find coconut oil too heavy.\n\nIt is a massage oil, not a medicine: if you are losing a lot of hair, please see a dermatologist.",
        keyPoints: [
            "Methi, rosemary and peppermint",
            "Lighter than coconut-based oils",
            "Tingly, cooling massage",
        ],
        howToUse:
            "Apply a few drops directly to the scalp along partings and massage. Leave 1–2 hours or overnight, then wash.",
        materials:
            "Sesamum Indicum Seed Oil, Trigonella Foenum-Graecum Seed Extract, Caprylic/Capric Triglyceride, Rosmarinus Officinalis Leaf Oil, Mentha Piperita Oil, Tocopherol.",
        ...ARANYA,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 7, warnAt: 3 },
        variants: [],
        images: [P.oil3],
        demand: 0.8,
        reviews: [],
    },
    {
        slug: "kesar-lab-scalp-tonic",
        name: "Kesar Lab Balancing Scalp Tonic",
        category: "treatments",
        option: null,
        price: "980",
        mrp: "980",
        description:
            "A leave-in scalp spray with niacinamide, salicylic acid and witch hazel for scalps that get oily by day two. It does not wet the lengths, so you can use it on dry hair between washes.",
        keyPoints: [
            "Niacinamide and salicylic acid",
            "For oily, buildup-prone scalps",
            "Leave-in spray, no rinse",
        ],
        howToUse:
            "Part the hair and spray along the parting, 6–8 sprays in all. Massage in with fingertips. Daily or every other day.",
        materials:
            "Aqua, Alcohol Denat., Niacinamide, Salicylic Acid, Hamamelis Virginiana Water, Panthenol, Menthol, Fragrance.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 4, warnAt: 2 },
        variants: [],
        images: [P.tonic],
        demand: 0.5,
        reviews: [],
    },

    /* ---------------- Styling ---------------- */
    {
        slug: "kesar-lab-heat-protect-spray",
        name: "Kesar Lab Heat Protect Spray",
        category: "styling",
        option: null,
        price: "750",
        mrp: "750",
        description:
            "A light mist that protects hair from blow-dryers, straighteners and curling tongs up to 220°C. It also cuts drying time a little and doesn't leave hair stiff.",
        keyPoints: [
            "Protects up to 220°C",
            "Light, non-sticky mist",
            "Use before every blow-dry or straightening",
        ],
        howToUse:
            "Spray evenly over towel-dried hair from 20 cm, comb through, then dry or style. On dry hair, mist lightly before using tongs or a straightener.",
        materials:
            "Aqua, Alcohol Denat., PVP, Hydrolyzed Wheat Protein, Polyquaternium-11, Panthenol, Amodimethicone, Fragrance.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 11, warnAt: 3 },
        variants: [],
        images: [P.heat],
        demand: 1.6,
        reviews: [
            r(
                5,
                "Tanya L.",
                21,
                "I straighten every day for office. Since using this my ends don't smell burnt and feel less crispy.",
            ),
            r(
                4,
                "Megha R.",
                66,
                "Works well. The nozzle sometimes sprays in a jet instead of mist.",
            ),
        ],
    },
    {
        slug: "kesar-lab-dry-shampoo",
        name: "Kesar Lab Dry Shampoo",
        category: "styling",
        option: null,
        price: "690",
        mrp: "750",
        description:
            "A rice-starch dry shampoo that soaks up oil at the roots and adds a little grip. Good for day two of a blow-dry and for keeping a bridal or party hairdo fresh into the next day.\n\nThe powder can show on very dark hair if you spray too close; brush it through well.",
        keyPoints: [
            "Rice starch absorbs oil at the roots",
            "Adds volume and grip",
            "Extends a blow-dry by a day",
        ],
        howToUse:
            "Shake well. Hold 25–30 cm from the roots and spray in short bursts. Wait a minute, then massage and brush through.",
        materials:
            "Butane, Isobutane, Propane, Alcohol Denat., Oryza Sativa Starch, Silica, Fragrance.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 0, warnAt: 3 },
        variants: [],
        images: [P.dry],
        demand: 1.2,
        reviews: [
            r(
                4,
                "Simran K.",
                14,
                "Life saver on day two after a blow-dry. Leaves a slight white cast on my black hair unless I brush a lot.",
                null,
                "Thanks Simran, holding it further away and brushing after a minute helps. Back in stock next week! — Noor",
            ),
        ],
    },
    {
        slug: "kesar-lab-leave-in-cream",
        name: "Kesar Lab Leave-In Conditioning Cream",
        category: "styling",
        option: null,
        price: "720",
        mrp: "720",
        description:
            "A light leave-in cream for detangling and softening hair that is dry or wavy. Works as a base before air-drying or a blow-dry.",
        keyPoints: [
            "Detangles and softens",
            "For dry, wavy and thick hair",
            "Air-dry or blow-dry",
        ],
        howToUse:
            "Smooth a pea-to-coin sized amount through damp lengths. Comb through and style.",
        materials:
            "Aqua, Cetearyl Alcohol, Glycerin, Behentrimonium Chloride, Butyrospermum Parkii Butter, Panthenol, Amodimethicone, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 7, warnAt: 2 },
        variants: [],
        images: [P.leavein],
        demand: 0.8,
        reviews: [],
    },
    {
        slug: "kesar-lab-curl-defining-cream",
        name: "Kesar Lab Curl Defining Cream",
        category: "styling",
        option: null,
        price: "780",
        mrp: "780",
        description:
            "For wavy and curly hair that frizzes into a cloud in the monsoon. Flaxseed gel and shea butter clump curls together and give soft hold without crunch.",
        keyPoints: [
            "Flaxseed and shea butter",
            "Defines waves and curls",
            "Soft hold, no crunch",
        ],
        howToUse:
            "On soaking-wet hair, rake through sections and scrunch upward. Air-dry or use a diffuser, then scrunch out once fully dry.",
        materials:
            "Aqua, Linum Usitatissimum Seed Extract, Glycerin, Butyrospermum Parkii Butter, Cetearyl Alcohol, Polyquaternium-10, Panthenol, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 5, warnAt: 2 },
        variants: [],
        images: [P.curl],
        demand: 0.6,
        reviews: [
            r(
                3,
                "Ayesha M.",
                47,
                "Defines my waves nicely on day one but by evening the frizz is back when it's humid. Okay, not magic.",
                null,
                "Thanks for being honest, Ayesha. A little Smooth Finish Serum on top once dry helps seal it in the monsoon. — Kavya",
            ),
        ],
    },

    /* ---------------- Hair colour ---------------- */
    {
        slug: "tarini-pro-cream-hair-colour",
        name: "Tarini Pro Cream Hair Colour, 60 g",
        category: "colour",
        option: "shade",
        price: "420",
        mrp: "420",
        description:
            "The permanent cream colour our colourists use, in a 60 g tube, for clients who want to keep up a root touch-up at home between salon visits. It covers grey well and stays even from root to end.\n\nPlease read this before you buy. Like most permanent hair colour, it contains ammonia and PPD (paraphenylenediamine), which can cause a serious allergic reaction in some people. Do a patch test 48 hours before every use, even if you have coloured before. We sell it after a short consult at the desk, so we can match your shade and mixing ratio to what we use on you. If you have ever reacted to hair dye or a black henna tattoo, don't use it; ask us about our PPD-free options at the salon instead.",
        keyPoints: [
            "Permanent cream colour, 28 shades",
            "Full grey coverage on natural levels",
            "Mix 1:1 with Tarini Developer 6%",
            "Contains ammonia and PPD: patch test 48 hours before every use",
            "Sold after a consult at the desk",
        ],
        howToUse:
            "Patch test 48 hours before: dab a little mixed colour behind the ear, leave it, and don't use the colour if you see redness, itching or swelling. To colour roots: wear gloves, mix 30 g colour with 30 ml developer in a non-metal bowl, apply to dry, unwashed roots with a tint brush, leave 35 minutes, rinse until the water runs clear, then shampoo and condition. Keep away from eyes and eyebrows.",
        materials:
            "Aqua, Cetearyl Alcohol, Propylene Glycol, Ammonium Hydroxide, Oleth-30, Ethanolamine, p-Phenylenediamine, Resorcinol, m-Aminophenol, 4-Amino-2-Hydroxytoluene, Sodium Sulfite, Ascorbic Acid, Fragrance. Exact dyes vary by shade.",
        ...TARINI,
        gstRate: 18,
        hsnCode: "3305",
        stock: null,
        variants: HAIR_SHADES.map((s) => ({
            title: hairTitle(s),
            sku: `TPC-${s.n.replace(".", "")}`,
            price: null,
            mrp: null,
            stock: { onHand: s.onHand, warnAt: s.warnAt },
            imageIndex: null,
            image: demoAsset(hairFile(s)),
        })),
        images: [
            P.colour,
            card(
                HAIR_CARD,
                "Shade card of all 28 Tarini Pro Cream Colour shades, from 1.0 Black to 9.0 Very Light Blonde",
            ),
        ],
        demand: 1.8,
        reviews: [
            r(
                5,
                "Sunita S.",
                29,
                "I get my global colour at Noor and do roots at home in between with 4.0. Noor showed me exactly how much to mix. Matches perfectly.",
                "4.0 Medium Brown",
                "Thank you, Sunita ji. Do keep up the patch test each time! — Noor",
            ),
            r(
                4,
                "Rekha J.",
                45,
                "Good grey coverage with 3.0. Smell of ammonia is strong, do it near a window.",
                "3.0 Dark Brown",
            ),
            r(
                5,
                "Farah N.",
                18,
                "4.62 burgundy is gorgeous in sunlight. Tanvi helped me pick it.",
                "4.62 Burgundy",
            ),
            r(
                2,
                "Deepa K.",
                80,
                "My patch test went red and itchy so I couldn't use it. Not the product's fault exactly, but I wish I had known about my PPD allergy earlier.",
                "5.0 Light Brown",
                "We're so sorry, Deepa, and glad you patch tested. Please come in, we've refunded the tube and can show you the PPD-free options we use in the salon. — Noor",
            ),
        ],
    },
    {
        slug: "tarini-cream-developer-6",
        name: "Tarini Cream Developer 6% (20 vol), 120 ml",
        category: "colour",
        option: null,
        price: "220",
        mrp: "220",
        description:
            "The 6% cream developer to mix 1:1 with Tarini Pro Cream Colour for root touch-ups and grey coverage. One bottle does two touch-ups of 30 g colour.",
        keyPoints: [
            "6% (20 volume) cream peroxide",
            "Mix 1:1 with Tarini Pro Cream Colour",
            "Two touch-ups per bottle",
        ],
        howToUse:
            "Wear gloves. Measure 30 ml into a non-metal bowl with 30 g colour and mix until smooth. Use right away; throw away leftover mix.",
        materials:
            "Aqua, Hydrogen Peroxide (6%), Cetearyl Alcohol, Ceteareth-25, Phosphoric Acid, Disodium Pyrophosphate, Etidronic Acid.",
        ...TARINI,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 22, warnAt: 6 },
        variants: [],
        images: [P.developer],
        demand: 1.4,
        reviews: [],
    },
    {
        slug: "sheesham-tint-brush-bowl-set",
        name: "Tint Brush & Bowl Set",
        category: "colour",
        option: null,
        price: "350",
        mrp: "350",
        description:
            "A non-metal mixing bowl with measure lines and a stiff-bristle tint brush with a tail end for sectioning: what you need to do a neat root touch-up at home.",
        keyPoints: [
            "Bowl with ml markings and a rubber grip base",
            "Tint brush with a tail for partings",
            "Non-metal, safe for colour and developer",
        ],
        howToUse:
            "Mix colour and developer in the bowl, section with the tail, apply with the brush. Rinse both straight after use.",
        materials: "Polypropylene bowl, nylon bristles, ABS handle.",
        ...SHEESHAM,
        gstRate: 18,
        hsnCode: "9603",
        stock: { onHand: 10, warnAt: 3 },
        variants: [],
        images: [P.bowl],
        demand: 0.8,
        reviews: [],
    },

    /* ---------------- Men's grooming ---------------- */
    {
        slug: "aranya-beard-oil",
        name: "Aranya Beard Oil, Sandalwood & Vetiver",
        category: "mens",
        option: null,
        price: "450",
        mrp: "499",
        description:
            "A light beard oil of jojoba, almond and argan with sandalwood and khus (vetiver). Softens a coarse beard and calms the itch while it grows in. Imran uses it to finish every beard trim.",
        keyPoints: [
            "Jojoba, almond and argan oils",
            "Sandalwood and khus scent, not too strong",
            "Softens coarse beards, calms itch",
            "Dropper bottle",
        ],
        howToUse:
            "After a wash, rub 3–5 drops between palms and work into the beard and the skin underneath. Comb through.",
        materials:
            "Simmondsia Chinensis Seed Oil, Prunus Amygdalus Dulcis Oil, Argania Spinosa Kernel Oil, Santalum Album Oil, Vetiveria Zizanoides Root Oil, Tocopherol.",
        ...ARANYA,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 9, warnAt: 3 },
        variants: [],
        images: [P.beardoil, P.beardoil2],
        demand: 1.2,
        reviews: [
            r(
                5,
                "Rahul S.",
                10,
                "Imran put this on after my trim and I bought it on the spot. Smell is subtle and the beard feels much softer.",
                null,
                "Glad you liked it, Rahul. See you in three weeks! — Imran",
            ),
            r(4, "Vikram R.", 55, "Good oil. 30 ml lasts me about 6 weeks."),
        ],
    },
    {
        slug: "aranya-beard-wash",
        name: "Aranya Beard & Face Wash",
        category: "mens",
        option: null,
        price: "350",
        mrp: "350",
        description:
            "A gentle wash for beard and face together, with aloe and a little tea tree. Cleans out dust and food without drying the skin under the beard.",
        keyPoints: [
            "Cleans beard and the skin beneath",
            "Aloe and tea tree",
            "Mild, soap-free",
        ],
        howToUse:
            "Lather a small amount in wet hands, massage into beard and face, rinse. Follow with beard oil.",
        materials:
            "Aqua, Sodium Cocoyl Glycinate, Coco-Glucoside, Aloe Barbadensis Leaf Juice, Glycerin, Melaleuca Alternifolia Leaf Oil, Citric Acid, Sodium Benzoate.",
        ...ARANYA,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 6, warnAt: 2 },
        variants: [],
        images: [P.beardwash],
        demand: 0.6,
        reviews: [],
    },
    {
        slug: "kesar-lab-matte-clay",
        name: "Kesar Lab Matte Styling Clay",
        category: "mens",
        option: null,
        price: "599",
        mrp: "650",
        description:
            "A medium-hold clay with a natural matte finish for short and medium men's cuts: textured crops, side parts, messy quiffs. Washes out with one shampoo.",
        keyPoints: [
            "Medium hold, matte finish",
            "Restyle through the day",
            "Washes out easily",
        ],
        howToUse:
            "Rub a fingertip of clay between palms until warm and invisible, then work into dry or towel-dried hair from the back forward. Shape with fingers.",
        materials:
            "Aqua, Kaolin, Cera Alba, Lanolin, Glyceryl Stearate, Ceteareth-25, Bentonite, Fragrance, Phenoxyethanol.",
        ...KESAR,
        gstRate: 18,
        hsnCode: "3305",
        stock: { onHand: 8, warnAt: 3 },
        variants: [],
        images: [P.clay],
        demand: 0.9,
        reviews: [
            r(
                5,
                "Karan B.",
                33,
                "Holds my hair all day at college without looking wet. Exactly what Imran uses.",
            ),
        ],
    },

    /* ---------------- Nails ---------------- */
    {
        slug: "tarini-nail-lacquer",
        name: "Tarini Nail Lacquer, 9 ml",
        category: "nails",
        option: "nail-shade",
        price: "325",
        mrp: "325",
        description:
            "A long-wear nail lacquer in 18 shades, from wedding reds to everyday nudes. A wide flat brush gives full coverage in two coats, and the formula is free of formaldehyde, toluene and DBP.\n\nPooja keeps the full range at the nail desk, so you can try a shade on one nail before you buy.",
        keyPoints: [
            "18 shades, cream finish",
            "Full coverage in two coats",
            "Formaldehyde-, toluene- and DBP-free",
            "Wide flat brush",
            "Lasts 5–7 days with base and top coat",
        ],
        howToUse:
            "On clean, dry nails apply a base coat, then two thin coats of colour, letting each dry for 2 minutes. Seal with a top coat, wrapping the tip.",
        materials:
            "Butyl Acetate, Ethyl Acetate, Nitrocellulose, Adipic Acid/Neopentyl Glycol/Trimellitic Anhydride Copolymer, Acetyl Tributyl Citrate, Isopropyl Alcohol, Stearalkonium Bentonite. May contain: CI 77891, CI 15850, CI 77491, CI 77499, CI 19140, CI 77510.",
        ...TARINI,
        gstRate: 18,
        hsnCode: "3304",
        stock: null,
        variants: NAIL_SHADES.map((s) => ({
            title: s.name,
            sku: `TNL-${kebab(s.name).toUpperCase()}`,
            price: null,
            mrp: null,
            stock: { onHand: s.onHand, warnAt: s.warnAt },
            imageIndex: null,
            image: demoAsset(nailFile(s)),
        })),
        images: [
            P.nail,
            card(NAIL_CARD, "Shade card of all 18 Tarini Nail Lacquer shades"),
        ],
        demand: 2,
        reviews: [
            r(
                5,
                "Priya A.",
                7,
                "Bought Sindoor for Karwa Chauth. Perfect red, lasted the whole week without chipping with the top coat.",
                "Sindoor",
                "Wishing you a lovely Karwa Chauth, Priya! — Pooja",
            ),
            r(
                4,
                "Ruchi M.",
                24,
                "Nude Chai is my everyday shade now. Two coats needed, one is streaky.",
                "Nude Chai",
            ),
            r(
                5,
                "Heena K.",
                49,
                "Marsala looks so rich with a lehenga. Got compliments at my cousin's sangeet.",
                "Marsala",
            ),
            r(
                3,
                "Garima T.",
                68,
                "Colour is lovely but chipped on day 3 without a top coat. With top coat it's fine.",
                "Peacock Teal",
            ),
        ],
    },
    {
        slug: "tarini-base-top-coat",
        name: "Tarini Base Coat & Top Coat, 9 ml",
        category: "nails",
        option: "coat",
        price: "350",
        mrp: "350",
        description:
            "A ridge-filling base coat that stops dark shades staining your nails, and a quick-dry glossy top coat that makes polish last days longer. Sold separately.",
        keyPoints: [
            "Base coat smooths ridges and prevents staining",
            "Top coat dries to touch in about 2 minutes",
            "High-gloss, chip-resistant finish",
        ],
        howToUse:
            "Base coat first on clean nails, then colour, then top coat. Refresh the top coat every 2–3 days.",
        materials:
            "Butyl Acetate, Ethyl Acetate, Nitrocellulose, Acetyl Tributyl Citrate, Isopropyl Alcohol, Silica, Benzophenone-1.",
        ...TARINI,
        gstRate: 18,
        hsnCode: "3304",
        stock: null,
        variants: [
            v("Base coat", "TNL-BASE", 9, 3),
            v("Top coat", "TNL-TOP", 3, 3),
        ],
        images: [P.basecoat],
        demand: 1.1,
        reviews: [],
    },
    {
        slug: "tarini-acetone-free-remover",
        name: "Tarini Acetone-Free Nail Polish Remover, 100 ml",
        category: "nails",
        option: null,
        price: "199",
        mrp: "199",
        description:
            "An acetone-free remover with glycerin and vitamin E. Gentler on nails and cuticles than acetone; takes a little longer on glitter and dark shades.",
        keyPoints: [
            "Acetone-free",
            "Glycerin and vitamin E",
            "Not for gel polish",
        ],
        howToUse:
            "Soak a cotton pad, press on the nail for 10 seconds, then wipe from base to tip. Wash hands afterwards.",
        materials:
            "Ethyl Acetate, Isopropyl Alcohol, Aqua, Glycerin, Tocopheryl Acetate, Fragrance.",
        ...TARINI,
        gstRate: 18,
        hsnCode: "3304",
        stock: { onHand: 15, warnAt: 4 },
        variants: [],
        images: [P.remover],
        demand: 1,
        reviews: [],
    },
    {
        slug: "aranya-cuticle-oil",
        name: "Aranya Cuticle Oil, 10 ml",
        category: "nails",
        option: null,
        price: "299",
        mrp: "299",
        description:
            "Almond and jojoba oil with a drop of lemongrass, in a brush-tip bottle. Keeps cuticles soft between manicures and helps gel polish wear look tidier.",
        keyPoints: [
            "Almond and jojoba oils",
            "Brush applicator",
            "For dry cuticles and after gel removal",
        ],
        howToUse: "Brush onto each cuticle at night and massage in.",
        materials:
            "Prunus Amygdalus Dulcis Oil, Simmondsia Chinensis Seed Oil, Cymbopogon Citratus Leaf Oil, Tocopherol.",
        ...ARANYA,
        gstRate: 18,
        hsnCode: "3304",
        stock: { onHand: 10, warnAt: 3 },
        variants: [],
        images: [P.cuticle],
        demand: 0.7,
        reviews: [],
    },

    /* ---------------- Tools ---------------- */
    {
        slug: "sheesham-paddle-brush",
        name: "Sheesham Wood Paddle Brush",
        category: "tools",
        option: null,
        price: "750",
        mrp: "850",
        description:
            "A wide paddle brush with a sheesham-wood body and ball-tipped pins on an air cushion. Detangles long hair gently and smooths it flat for a quick blow-dry.",
        keyPoints: [
            "Sheesham wood, hand-finished",
            "Ball-tipped nylon pins on a rubber cushion",
            "Good for long and thick hair",
        ],
        howToUse:
            "Brush from the ends upward in sections. On wet hair, use leave-in first and go gently.",
        materials: "Sheesham wood, natural rubber cushion, nylon pins.",
        ...SHEESHAM,
        gstRate: 18,
        hsnCode: "9603",
        stock: { onHand: 6, warnAt: 2 },
        variants: [],
        images: [P.paddle],
        demand: 0.7,
        reviews: [
            r(
                5,
                "Meera K.",
                85,
                "Beautiful brush, feels solid. Detangles my waist-length hair without pulling.",
            ),
        ],
    },
    {
        slug: "sheesham-ceramic-round-brush",
        name: "Ceramic Round Brush",
        category: "tools",
        option: "barrel",
        price: "650",
        mrp: "650",
        description:
            "The round brush our stylists use for blow-dries: a vented ceramic barrel that heats evenly, with boar and nylon bristles for grip and shine. Small for bangs and short hair, medium for bounce, large for smooth lengths.",
        keyPoints: [
            "Vented ceramic barrel heats evenly",
            "Boar and nylon bristle mix",
            "Three barrel sizes",
        ],
        howToUse:
            "On 80% dry hair, take sections no wider than the brush, roll from root to end under the dryer nozzle, and cool before releasing.",
        materials:
            "Ceramic-coated aluminium barrel, boar and nylon bristles, sheesham wood handle.",
        ...SHEESHAM,
        gstRate: 18,
        hsnCode: "9603",
        stock: null,
        variants: [
            v("25 mm", "SH-CRB-25", 5, 2),
            v("33 mm", "SH-CRB-33", 7, 2, "750", "750"),
            v("43 mm", "SH-CRB-43", 4, 2, "850", "850"),
        ],
        images: [P.round],
        demand: 0.6,
        reviews: [
            r(
                4,
                "Nandini B.",
                36,
                "Bought the 43 mm after watching Riya do my blow-dry. Takes practice but now I get the same smooth ends. Handle could be lighter.",
                "43 mm",
            ),
        ],
    },
    {
        slug: "sheesham-neem-wide-tooth-comb",
        name: "Neem Wood Wide-Tooth Comb",
        category: "tools",
        option: null,
        price: "220",
        mrp: "220",
        description:
            "A hand-cut neem wood comb with wide teeth, for detangling wet hair after conditioner without snapping it. Wood doesn't build static the way plastic does.",
        keyPoints: [
            "Neem wood, hand-cut and polished",
            "Wide teeth for wet detangling",
            "Less static than plastic",
        ],
        howToUse:
            "Comb from the ends upward. Wipe dry after use and keep out of standing water.",
        materials: "Neem wood.",
        ...SHEESHAM,
        gstRate: 18,
        hsnCode: "9615",
        stock: { onHand: 18, warnAt: 4 },
        variants: [],
        images: [P.comb],
        demand: 0.9,
        reviews: [],
    },
    {
        slug: "sheesham-tail-comb",
        name: "Carbon Tail Comb",
        category: "tools",
        option: null,
        price: "180",
        mrp: "180",
        description:
            "A heat-resistant carbon comb with a fine-tooth end and a tail for neat partings and sections. The same comb we use for colour and styling.",
        keyPoints: [
            "Heat- and chemical-resistant carbon",
            "Fine teeth and a tail for partings",
            "Anti-static",
        ],
        howToUse: "Use the tail to part and section; comb with the fine teeth.",
        materials: "Carbon-fibre reinforced plastic.",
        ...SHEESHAM,
        gstRate: 18,
        hsnCode: "9615",
        stock: { onHand: 14, warnAt: 4 },
        variants: [],
        images: [P.tailcomb],
        demand: 0.5,
        reviews: [],
    },
    {
        slug: "sheesham-claw-clip",
        name: "Tortoiseshell Claw Clip",
        category: "tools",
        option: null,
        price: "299",
        mrp: "299",
        description:
            "A strong claw clip in tortoiseshell acetate that holds thick hair up for a facial, a mehendi sitting or a hot afternoon, without a dent.",
        keyPoints: [
            "Holds thick, long hair without slipping",
            "Smooth teeth that don't snag",
            "Tortoiseshell finish",
        ],
        howToUse:
            "Twist the hair up, open the clip and close it against the twist, teeth towards the scalp.",
        materials: "Cellulose acetate, steel spring.",
        ...SHEESHAM,
        gstRate: 18,
        hsnCode: "9615",
        stock: { onHand: 3, warnAt: 4 },
        variants: [],
        images: [P.clip],
        demand: 0.4,
        reviews: [],
    },
];

/* ------------------------------------------------------------------ */
/* Generated images                                                    */
/* ------------------------------------------------------------------ */

export const NOOR_SWATCHES: DsSwatch[] = [
    ...HAIR_SHADES.map((s): DsSwatch => ({
        file: hairFile(s),
        kind: "hair",
        hex: s.hex,
        title: s.n,
        subtitle: s.name,
    })),
    ...NAIL_SHADES.map((s): DsSwatch => ({
        file: nailFile(s),
        kind: "nail",
        hex: s.hex,
        title: s.name,
        subtitle: "Tarini Nail Lacquer, 9 ml",
    })),
    {
        file: HAIR_CARD,
        kind: "card",
        hex: HAIR_SHADES.map((s) => s.hex),
        title: "Tarini Pro Cream Colour",
        subtitle: "28 shades · 60 g",
        labels: HAIR_SHADES.map((s) => s.n),
    },
    {
        file: NAIL_CARD,
        kind: "card",
        hex: NAIL_SHADES.map((s) => s.hex),
        title: "Tarini Nail Lacquer",
        subtitle: "18 shades · 9 ml",
        labels: NAIL_SHADES.map((s) => s.name),
    },
];
