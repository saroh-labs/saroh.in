/**
 * Share as a post (#1375, plan 2026-11-12-003 U2): what one live item's
 * share sheet needs, and the addresses it opens. Pure and client-safe.
 *
 * The pictures are the API's (`GET public/share/:siteId/:kind/:ref/image`,
 * public, open CORS): five styles in three sizes, in the business's own
 * look, or on a colour picked in the sheet. The link is the item's live page, tagged so a visit from a post is
 * counted.
 */

export const CARD_STYLES = [
    "photo",
    "price",
    "offer",
    "simple",
    "colour",
] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const CARD_SIZES = ["post", "square", "story"] as const;
export type CardSize = (typeof CARD_SIZES)[number];

/** What can be shared: a product, a service, a blog post, the booking page, an offer (a live discount), or an own post. */
export type ShareItemKind =
    "product" | "service" | "post" | "book" | "offer" | "own";

/** One live thing to share. */
export interface ShareItem {
    kind: ShareItemKind;
    /** The API's ref: a product's or post's slug, a service's, offer's or own post's id; "page" for the booking page. */
    ref: string;
    name: string;
    /** "₹360", "₹300 to ₹500"; null with no price. */
    price: string | null;
    /** Its live page, untagged. */
    url: string;
    /** A live discount on it: the Offer card is drawn only with one. */
    offerId: string | null;
    /** A photo of its own (a blog post's cover, an own post's photo): Photo is offered only with one there. */
    hasPhoto?: boolean;
    /** A blog post's summary, for the "With summary" caption. */
    summary?: string | null;
}

/**
 * The locked Schedule (Saroh Social isn't built, so no business has it):
 * Free is pointed at the plans, Grow at the add-on, with its price only
 * when the catalogue has one.
 */
export type ScheduleLock =
    { tier: "free" } | { tier: "grow"; price: string | null };

/** The business's live site and its plan, read once on the server. */
export interface ShareSetup {
    /** The API's public address, where the pictures are. */
    apiOrigin: string;
    siteId: string;
    schedule: ScheduleLock;
    /** Colours from the site's own look, `#rrggbb`, for the colour row; may be empty. */
    swatches?: readonly string[];
}

/** What the sheet changes about every card at once. */
export interface CardLook {
    /** The card's own ground, `#rrggbb`; null keeps the site's colours. */
    bg?: string | null;
    /** The booking page card's headline. */
    headline?: string | null;
    /** A thumbnail's width in pixels; none draws the full size. */
    w?: number;
    /**
     * A saved own post's version (its `updatedAt`): the picture is kept
     * five minutes, so a changed post asks for a new one.
     */
    v?: string;
}

/** The app's own route for the booking page's card (`app/api/share/book/image`). */
export const BOOK_IMAGE_PATH = "/api/share/book/image";

/** The booking page card's headline when nothing is typed (owner, 12 Nov 2026). */
export const BOOK_HEADLINE = "Book your slot";
/** The API's cap on a headline. */
export const HEADLINE_MAX = 90;

/** The add-ons on Plan and billing, where Saroh Social will be added. */
export const ADD_ONS_HREF = "/settings/billing#add-ons";

/**
 * The cards each kind has (owner, 12 Nov 2026): a layout that needs what
 * the kind hasn't got (a price, a live discount, a photo) isn't offered.
 */
export function cardsFor(item: ShareItem): CardStyle[] {
    const photo: CardStyle[] = item.hasPhoto ? ["photo"] : [];
    switch (item.kind) {
        case "product":
        case "service":
            return [
                "photo",
                "price",
                ...(item.offerId !== null ? (["offer"] as const) : []),
                "simple",
                "colour",
            ];
        case "post":
            return [...photo, "colour", "simple"];
        case "book":
            return ["colour", "photo", "simple"];
        case "offer":
            return ["offer", "simple", "colour"];
        case "own":
            return ["colour", "simple", ...photo];
    }
}

/** The picture for one card at one size. */
export function cardImageUrl(
    setup: Pick<ShareSetup, "apiOrigin" | "siteId">,
    item: ShareItem,
    style: CardStyle,
    size: CardSize,
    look: CardLook = {},
): string {
    const offer = style === "offer" && item.offerId;
    const q = new URLSearchParams({ style, size });
    // The offer card draws the product being shared, not the discount's first.
    if (offer && item.kind === "product") q.set("product", item.ref);
    if (look.bg) q.set("bg", look.bg);
    const headline = look.headline?.trim();
    if (item.kind === "book" && headline) q.set("headline", headline);
    if (look.w) q.set("w", String(look.w));
    if (look.v) q.set("v", look.v);
    // The booking card takes a typed headline, so it is drawn through the
    // app's signed-in route, never a public address with words in it.
    if (item.kind === "book") return `${BOOK_IMAGE_PATH}?${q.toString()}`;
    const base = setup.apiOrigin.replace(/\/+$/, "");
    if (item.kind === "own") {
        return `${base}/public/share/own/${encodeURIComponent(item.ref)}/image?${q.toString()}`;
    }
    const [kind, ref] = offer ? ["offer", item.offerId] : [item.kind, item.ref];
    return `${base}/public/share/${encodeURIComponent(setup.siteId)}/${kind}/${encodeURIComponent(ref ?? "")}/image?${q.toString()}`;
}

/**
 * The colour row's swatches: the site's own colours, then lighter and
 * deeper tints of them, six to eight in all (fewer when the site has
 * fewer to offer), each `#rrggbb` once.
 */
export function shareSwatches(site: readonly string[], max = 8): string[] {
    const out: string[] = [];
    const add = (hex: string | null) => {
        if (hex && out.length < max && !out.includes(hex)) out.push(hex);
    };
    for (const hex of site) add(normalHex(hex));
    for (const amount of [0.55, -0.35]) {
        for (const hex of site) add(tint(normalHex(hex), amount));
    }
    return out;
}

const normalHex = (value: string): string | null =>
    /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;

/** Towards white (amount > 0) or black (< 0). */
function tint(hex: string | null, amount: number): string | null {
    if (!hex) return null;
    const to = amount > 0 ? 255 : 0;
    const k = Math.abs(amount);
    return `#${[1, 3, 5]
        .map((i) => {
            const c = Number.parseInt(hex.slice(i, i + 2), 16);
            return Math.round(c + (to - c) * k)
                .toString(16)
                .padStart(2, "0");
        })
        .join("")}`;
}

/**
 * The item's page, tagged so Saroh can count visits from a post (R5); a
 * saved own post adds its own campaign, `post-<id>`.
 */
export function taggedLink(url: string, postId?: string): string {
    try {
        const u = new URL(url);
        u.searchParams.set("utm_source", "saroh-share");
        u.searchParams.set("utm_medium", "social");
        if (postId) u.searchParams.set("utm_campaign", `post-${postId}`);
        return u.toString();
    } catch {
        return url;
    }
}

/** The caption as shared: the link stays at its end, whatever was typed. */
export function withLink(caption: string, link: string): string {
    const text = caption.trim();
    if (text.includes(link)) return text;
    return text ? `${text} ${link}` : link;
}

/** WhatsApp on this device, with the caption and its link filled in. */
export const whatsappHref = (text: string) =>
    `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Facebook's share window for the link (it takes no caption). */
export const facebookHref = (link: string) =>
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;

/** "cardamom-bun-box-price-post.png" */
export function cardFileName(
    item: ShareItem,
    style: CardStyle,
    size: CardSize,
): string {
    const stem =
        item.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || item.kind;
    return `${stem}-${style}-${size}.png`;
}
