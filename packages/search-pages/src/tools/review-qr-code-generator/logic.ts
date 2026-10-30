import { isLink } from "../qr";

/**
 * The Google review QR code (design ReviewQr*.dc.html): the code holds the
 * review link and nothing else. Saroh can't open a Google profile, so the
 * link's shape is all it checks: the short link Google Business Profile's
 * "Ask for reviews" gives (g.page/r/…/review), or the long writereview link.
 */

const REVIEW_SHAPES = [
    /^https:\/\/g\.page\/r\/[\w-]+\/review\/?(\?.*)?$/i,
    /^https:\/\/search\.google\.com\/local\/writereview\?(.*&)?placeid=[\w-]+/i,
];

/** A Maps or listing link: it opens the profile, not the review box. */
const MAPS =
    /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|g\.page\/(?!r\/))/i;

export type LinkProblem = "not-link" | "maps" | "not-review" | null;

export function reviewLinkProblem(value: string): LinkProblem {
    const v = value.trim();
    if (REVIEW_SHAPES.some((r) => r.test(v))) return null;
    if (MAPS.test(v)) return "maps";
    return isLink(v) ? "not-review" : "not-link";
}

/** The name prints on one line up to here, on two after it. */
export const NAME_ONE_LINE = 28;
export const NAME_MAX = 60;

export const SIZES = [
    { value: "counter", label: "Counter card" },
    { value: "tent", label: "Table tent" },
    { value: "sticker", label: "Sticker" },
] as const;

export type Size = (typeof SIZES)[number]["value"];

export const WORDS = {
    form: "Your review card",
    name: "Business name",
    nameHint: "Printed on the card, as customers know you.",
    nameLong: (n: number) =>
        `This prints on two lines. ${n} of ${NAME_MAX} characters.`,
    link: "Your Google review link",
    linkHint:
        "In Google Business Profile, open Ask for reviews and copy the link.",
    linkBad: {
        maps: "That link opens your Maps listing, not the review box. In Google Business Profile, use Ask for reviews and copy that link.",
        "not-review":
            "That isn't a Google review link. In Google Business Profile, use Ask for reviews and copy that link.",
        "not-link":
            "That isn't a link yet. Paste the full address, starting with https://",
    },
    head: "Words on the card",
    headStart: "Liked your visit? Tell others on Google.",
    size: "Print as",
    sizeHint:
        "Counter card is A6. Table tent folds from A5. Sticker is 8 cm square.",
    eyebrow: "Scan to review",
    scan: "Point your phone camera at the code; it takes a minute.",
    sample: "A sample. Paste your review link to make yours.",
    gate: "Get your review card",
    gateButton: "Get my card",
    after: "You get a PNG of the code and the card to print or save as a PDF, in the size you picked.",
    png: "Download PNG",
    print: "Print the card",
} as const;
