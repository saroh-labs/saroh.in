/**
 * What Rye & Co.'s Product Detail and Editor films show beyond the
 * catalogue (#522, #525): photos, reviews from people who bought the
 * product, and the two discount codes that reach the Sourdough loaf — the
 * designs' sample data (`saroh-fixtures.js`: MEDIA, REVIEWS, the loaf's
 * ratings and discounts). Data only; `bakery-product-page-write.ts` writes
 * it.
 *
 * Photos are free-licence Unsplash images hot-linked by address, as the
 * boutique's are (local storage keeps no uploads), each checked to load and
 * to show what it says (`scripts/check-demo-images.mjs`). The design's
 * shaping video is left out: a video must be an uploaded file.
 */

export interface RyePhoto {
    url: string;
    alt: string;
    width: number;
    height: number;
    creditName: string;
    creditUrl: string;
    /** The variant (by value) this photo is the picture of. */
    variant?: string;
}

const unsplash = (photo: string) =>
    `https://images.unsplash.com/${photo}?w=1600&q=80&auto=format&fit=crop`;

/** Photos by product slug, in order; the first is the cover. */
export const PHOTOS: Record<string, readonly RyePhoto[]> = {
    "sourdough-loaf": [
        {
            url: unsplash("photo-1753012247961-feb139675068"),
            alt: "Dark-crusted sourdough loaves stacked on the bench, scored and dusted with flour",
            width: 1600,
            height: 1067,
            creditName: "lee seunghyub",
            creditUrl: "https://unsplash.com/@sobalc",
        },
        {
            url: unsplash("photo-1744217083335-8b57ec3826ac"),
            alt: "A loaf cut open on a wooden board, two slices showing the crumb",
            width: 1600,
            height: 1067,
            creditName: "Victoria Druc",
            creditUrl: "https://unsplash.com/@vikaelefant",
            variant: "400g",
        },
    ],
    "cinnamon-bun": [
        {
            url: unsplash("photo-1530006261244-0ae043004358"),
            alt: "Cinnamon buns in paper cases on a wooden tray",
            width: 1600,
            height: 1067,
            creditName: "Honey Fangs",
            creditUrl: "https://unsplash.com/@honeyfangs",
        },
    ],
    "focaccia-rosemary": [
        {
            url: unsplash("photo-1593629718617-bc1b024cf15a"),
            alt: "Squares of focaccia with rosemary on a dark board, flaky salt beside them",
            width: 1600,
            height: 1067,
            creditName: "Quin Engle",
            creditUrl: "https://unsplash.com/@twistsandzests",
        },
    ],
    "house-blend-beans-250g": [
        {
            url: unsplash("photo-1654202752477-22b5bc52d4da"),
            alt: "Roasted coffee beans spilling from a jute bag",
            width: 1600,
            height: 1067,
            creditName: "Krasimir Savchev",
            creditUrl: "https://unsplash.com/@k_savchev",
        },
    ],
};

export interface RyeReview {
    /** Who wrote it, by shopper key, when they bought it; else another buyer. */
    who: string;
    /** The variant (by value) they bought, when it matters. */
    variant?: string;
    rating: number;
    body: string;
    /** Absent: waiting for a reply. */
    reply?: string;
}

/**
 * Reviews by product slug. The loaf's twelve are the design's ratings —
 * eight fives, three fours and a three, 4.6 — with its four sample reviews
 * first; three of the twelve wait for a reply.
 */
export const REVIEWS: Record<string, readonly RyeReview[]> = {
    "sourdough-loaf": [
        {
            who: "priya",
            variant: "800g",
            rating: 5,
            body: "The crust is properly dark and it still tastes good on day three.",
            reply: "Thank you — the paper bag is doing its job.",
        },
        {
            who: "arjun",
            variant: "400g",
            rating: 4,
            body: "Lovely loaf. The small one sells out early on Saturdays.",
        },
        {
            who: "dev",
            rating: 3,
            body: "Good flavour, but mine was denser than the last one.",
        },
        {
            who: "meera",
            rating: 5,
            body: "Worth the early walk. Toasts beautifully.",
        },
        {
            who: "kavya",
            rating: 5,
            body: "Tangy without being sour. We finished it in two days.",
            reply: "Two days is about right in our house too.",
        },
        {
            who: "nikhil",
            rating: 5,
            body: "The best loaf in Indiranagar, and I have tried most of them.",
            reply: "That's kind — come by on a Saturday for the first bake.",
        },
        {
            who: "tara",
            rating: 4,
            body: "Great crumb. I'd love a seeded version.",
            reply: "Noted — the seeded multigrain is close, and we're testing one.",
        },
        {
            who: "sana",
            rating: 5,
            body: "Arrived the next morning, still crackling in the paper.",
            reply: "Thank you — glad it travelled well.",
        },
        {
            who: "rohan",
            rating: 5,
            body: "Makes the best toast. Keeps well in the bread bin.",
            reply: "Paper, not plastic, keeps the crust. Thank you!",
        },
        {
            who: "ishaan",
            rating: 4,
            body: "Really good bread. A little pricey, but worth it at the weekend.",
            reply: "It takes two days to make, which is most of the price. Thank you.",
        },
        {
            who: "anjali",
            rating: 5,
            body: "Proper sourdough. The dark bake is exactly how I like it.",
            reply: "We bake it dark on purpose — thank you.",
        },
        {
            who: "vikram",
            rating: 5,
            body: "Collected at seven and it was still warm. Lovely.",
            reply: "The first tray comes out at twenty to seven — glad you caught it.",
        },
    ],
    "cinnamon-bun": [
        {
            who: "priya",
            rating: 4,
            body: "Lovely, a little sweet for me.",
        },
        {
            who: "meera",
            rating: 5,
            body: "The orange glaze makes it. Soft all the way through.",
            reply: "Thank you — we'll tell the pastry bench.",
        },
        {
            who: "nikhil",
            rating: 5,
            body: "Soft in the middle, crisp at the edges. Gone in a minute.",
            reply: "That's the best review a bun can get. Thank you!",
        },
        {
            who: "dev",
            rating: 4,
            body: "Very good, but they're gone before nine.",
            reply: "We're baking a second tray on Saturdays now.",
        },
    ],
    "almond-croissant": [
        {
            who: "tara",
            rating: 5,
            body: "Flaky, not too sweet, and plenty of frangipane.",
            reply: "Thank you — it's baked twice, which is the trick.",
        },
        {
            who: "kavya",
            rating: 4,
            body: "Rich — one is plenty. A box of four did the whole weekend.",
            reply: "Thank you! They reheat well for five minutes in the oven.",
        },
        {
            who: "rohan",
            rating: 5,
            body: "The best almond croissant I've had in Bengaluru.",
            reply: "That's very kind. Thank you.",
        },
    ],
};

/**
 * The two codes the loaf's Discounts tab shows as applying now. A discount
 * reaches categories, not hand-picked collections, so WEEKEND10 reaches the
 * Weekend bakes collection's products by name, and says so.
 */
export const DISCOUNTS = {
    weekend: {
        code: "WEEKEND10",
        description: "the Weekend bakes collection, Saturdays and Sundays",
        percentBps: 1000,
        collection: "weekend",
    },
    firstLoaf: {
        code: "FIRSTLOAF",
        description: "a first order, anything in the shop",
        amount: "50",
    },
} as const;
