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

/**
 * The words a chip starts from. The link is never in them: it is the
 * caption's fixed chip, added at the end as it is shared (`withLink`).
 */
export function captionFor(kind: CaptionKind, item: ShareItem): string {
    if (item.kind === "post") {
        if (kind === "hinglish") {
            return `Naya post: ${item.name}. Padhne ke liye yahan dekhein:`;
        }
        if (kind === "summary" && item.summary?.trim()) {
            return `${item.name}: ${item.summary.trim()} Read it here:`;
        }
        return `${item.name}. Read it here:`;
    }
    if (item.kind === "offer") {
        return kind === "hinglish"
            ? `${item.name}. Offer dekhne ke liye yahan dekhein:`
            : `${item.name}. See it here:`;
    }
    if (item.kind === "own") return item.name;
    if (item.kind === "book") {
        return kind === "hinglish"
            ? `${item.name}. Booking ke liye yahan dekhein:`
            : `${item.name}. Book here:`;
    }
    const product = item.kind === "product";
    const go = product ? "Order here:" : "Book here:";
    if (kind === "price" && item.price) {
        return product
            ? `${item.name}, for ${item.price}. ${go}`
            : `${item.name}, ${item.price}. ${go}`;
    }
    if (kind === "hinglish") {
        const price = item.price ? ` sirf ${item.price} mein` : "";
        return product
            ? `${item.name} ab available hai${price}. Order karne ke liye yahan dekhein:`
            : `${item.name} ab book karein${price}. Booking ke liye yahan dekhein:`;
    }
    return `${item.name}. ${product ? "See it here:" : go}`;
}

export const SHARE_WORDS = {
    subtitle: (item: ShareItem) =>
        `A post in your website's look. Live on your ${item.kind === "product" || item.kind === "offer" ? "shop" : item.kind === "post" ? "blog" : item.kind === "own" ? "website" : "booking page"}.`,
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
    // Boards SBShare*, SPayoff*, BPost*, BCaption*, BDone* (16 Nov).
    ready: "Ready to share",
    downloadWhy: "Then post it from Instagram",
    copyWhy: "With the link at the end",
    whatsappShort: "WhatsApp",
    facebookShort: "Facebook",
    tryLook: "Try another look",
    editCaption: "Edit the caption",
    editCaptionShort: "Edit caption",
    captionDone: "Done",
    previewNote: "How it looks on Instagram. Each app crops a little.",
    previewTyping: "The preview follows your caption as you type.",
    swipe: "swipe for another look",
    copiesFirst: "Copies the caption first, for Instagram.",
    linkInBio: "Link in bio",
    readyFor: "Ready for Instagram",
    imageSaved: "Image saved to your Downloads",
    captionCopied: "Caption copied, with your link",
    pasteThere: "Caption copied. Paste it there.",
    payoffHow: "Open Instagram, pick the image and paste the caption.",
    openInstagram: "Open Instagram",
    alsoWhatsapp: "Also send on WhatsApp",
    whatsappToo: "WhatsApp too",
    skipCopy: "Skip the copy and paste next time.",
    skipCopyWhat:
        "Saroh Social posts to Instagram, Facebook and Threads for you, at a time you pick, and shows what each post brought in.",
    postStraight:
        "Post straight to Instagram, Facebook and Threads, now or later, with Saroh Social.",
    postsItForYou: "Saroh Social posts it for you.",
    scheduleWith: "Schedule with Saroh Social.",
    postTo: "Post to",
    sizeAndColours: "Size and colours",
    look: "Look",
    linkBecomes: "The link becomes “Link in bio” there.",
} as const;

/** Instagram shows this much of a caption before "… more". */
export const CAPTION_FOLD = 125;

/** The note under the caption: whether it fits before "… more". */
export const captionFits = (length: number) =>
    length <= CAPTION_FOLD
        ? `Instagram shows the first ${CAPTION_FOLD} characters before “… more”. Yours fits.`
        : `Instagram shows the first ${CAPTION_FOLD} characters before “… more”. Yours runs on: put the best part first.`;

/** "Changed to Hinglish", with Undo. */
export const changedTo = (kind: CaptionKind) =>
    `Changed to ${CAPTION_NAMES[kind]}`;

/** "Add Saroh Social · ₹X a month", or just the name with no price known. */
export const addSocialLabel = (price: string | null) =>
    price
        ? `${SHARE_WORDS.addSocial} · ${price} a month`
        : SHARE_WORDS.addSocial;
