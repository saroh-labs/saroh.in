import type { CardSize, CardStyle, ShareItem } from "./share";

/**
 * Every word the share sheet says (boards SFBDesk, SFBPhone and their
 * states), and the captions it starts from. The captions are fixed
 * templates: Hinglish is written here, never by a model.
 */

export const CARD_NAMES: Record<CardStyle, string> = {
    photo: "Photo",
    price: "Price tag",
    offer: "Offer",
    simple: "Simple",
    colour: "Colour",
};

export const SIZE_NAMES: Record<CardSize, string> = {
    post: "Post 4:5",
    square: "Square",
    story: "Story 9:16",
};

export const CAPTION_KINDS = ["short", "price", "summary", "hinglish"] as const;
export type CaptionKind = (typeof CAPTION_KINDS)[number];

export const CAPTION_NAMES: Record<CaptionKind, string> = {
    short: "Short",
    price: "With price",
    summary: "With summary",
    hinglish: "Hinglish",
};

/**
 * The captions this item has: With price only with a price, With summary
 * only for a blog post with one, and Hinglish only where the edition's
 * profile offers it (`hinglishCaptions`, DEC-204 item 7).
 */
export function captionKinds(
    item: ShareItem,
    hinglish: boolean,
): CaptionKind[] {
    return CAPTION_KINDS.filter((k) =>
        k === "price"
            ? item.kind !== "post" && item.price !== null
            : k === "summary"
              ? item.kind === "post" && Boolean(item.summary?.trim())
              : k === "hinglish"
                ? hinglish
                : true,
    );
}

/** The caption a chip starts from, its tagged link at the end. */
export function captionFor(
    kind: CaptionKind,
    item: ShareItem,
    link: string,
): string {
    if (item.kind === "post") {
        if (kind === "hinglish") {
            return `Naya post: ${item.name}. Padhne ke liye yahan dekhein: ${link}`;
        }
        if (kind === "summary" && item.summary?.trim()) {
            return `${item.name}: ${item.summary.trim()} Read it here: ${link}`;
        }
        return `${item.name}. Read it here: ${link}`;
    }
    if (item.kind === "book") {
        return kind === "hinglish"
            ? `${item.name}. Booking ke liye yahan dekhein: ${link}`
            : `${item.name}. Book here: ${link}`;
    }
    const product = item.kind === "product";
    const go = product ? "Order here:" : "Book here:";
    if (kind === "price" && item.price) {
        return product
            ? `${item.name}, for ${item.price}. ${go} ${link}`
            : `${item.name}, ${item.price}. ${go} ${link}`;
    }
    if (kind === "hinglish") {
        const price = item.price ? ` sirf ${item.price} mein` : "";
        return product
            ? `${item.name} ab available hai${price}. Order karne ke liye yahan dekhein: ${link}`
            : `${item.name} ab book karein${price}. Booking ke liye yahan dekhein: ${link}`;
    }
    return `${item.name}. ${product ? "See it here:" : go} ${link}`;
}

export const SHARE_WORDS = {
    subtitle: (item: ShareItem) =>
        `A post in your website's look · live on your ${item.kind === "product" ? "shop" : item.kind === "post" ? "blog" : item.kind === "own" ? "website" : "booking page"}`,
    headline: "Headline on the card",
    colours: "Colours",
    siteColours: "Site colours",
    ownColour: "Your own colour",
    pick: "Pick a post",
    caption: "Caption",
    linkNote:
        "The link to its page stays at the end, tagged so Saroh can count visits from this post.",
    shareFree: "Share now, free",
    download: "Download image",
    copy: "Copy caption",
    copied: "Copied",
    whatsapp: "Send on WhatsApp",
    facebook: "Share on Facebook",
    shareNow: "Share now",
    shareText: "Share caption and link",
    copiedFirst: "The caption is copied first, for Instagram.",
    pasteIt: "Caption copied. Paste it in Instagram.",
    noPicture: "The picture couldn't be made",
    noPictureWhy:
        "Your caption and link still work. Share them now, or try the picture again.",
    tryAgain: "Try again",
    shareFailed: "Couldn't open sharing on this phone.",
    shareFailedWhy:
        "Copy the caption from the box and paste it where you post.",
    copyFailed: "Couldn't copy the caption. Select it and copy it instead.",
    schedule: "Schedule",
    scheduleLine:
        "Schedule to Instagram, Facebook and Threads with Saroh Social.",
    scheduleLinePhone: "Schedule comes with Saroh Social.",
    addSocial: "Add Saroh Social",
    notNow: "Not now",
    socialWhat:
        "Post to Instagram, Facebook and Threads at a time you pick, and see what each post brings.",
    freeTitle: "Schedule with Saroh Social",
    freeComes: "Comes with Grow as an add-on, and with Pro.",
    growTitle: "Add Saroh Social to Grow",
    growBilled: "Billed with your Grow plan. Remove it any time.",
    ownerCanAdd: "Your business owner can add Saroh Social.",
    stillFree: "Share now stays free on every plan.",
} as const;

/** "Add Saroh Social · ₹X a month", or just the name with no price known. */
export const addSocialLabel = (price: string | null) =>
    price
        ? `${SHARE_WORDS.addSocial} · ${price} a month`
        : SHARE_WORDS.addSocial;
