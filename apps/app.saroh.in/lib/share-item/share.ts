/**
 * Share as a post (#1375, plan 2026-11-12-003 U2): what one live item's
 * share sheet needs, and the addresses it opens. Pure and client-safe.
 *
 * The pictures are the API's (`GET public/share/:siteId/:kind/:ref/image`,
 * public, open CORS): five styles in three sizes, in the business's own
 * look, or on a colour picked in the sheet. The link is the item's live
 * page, plain: no tracking words in what a customer reads.
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
 * Saroh Social beside Share: locked (Free is pointed at the plans, Grow at
 * the add-on, with its price only when the catalogue has one), or `on`,
 * where Share points at posting it with Saroh Social instead.
 */
export type ScheduleLock =
    { tier: "free" } | { tier: "grow"; price: string | null } | { tier: "on" };

/** Create post opened on one item, as Share names it (S9). */
export const postItHref = (item: Pick<ShareItem, "kind" | "ref">) =>
    `/social/new?kind=${encodeURIComponent(item.kind)}&ref=${encodeURIComponent(item.ref)}`;

/** The business's live site and its plan, read once on the server. */
export interface ShareSetup {
    /** The API's public address, where the pictures are. */
    apiOrigin: string;
    siteId: string;
    schedule: ScheduleLock;
    /** Colours from the site's own look, `#rrggbb`, for the colour row; may be empty. */
    swatches?: readonly string[];
    /** The site's name, as the post's preview shows its account. */
    business?: string;
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
        // Photo and Price tag draw the item's own photo to the edges:
        // without one the API draws a letter tile, so neither is offered.
        case "product":
        case "service":
            return [
                ...(item.hasPhoto ? (["photo", "price"] as const) : []),
                ...(item.offerId !== null ? (["offer"] as const) : []),
                "simple",
                "colour",
            ];
        case "post":
            return [...photo, "colour", "simple"];
        case "book":
            return ["colour", "simple", ...photo];
        case "offer":
            return ["offer", "simple", "colour"];
        case "own":
            return ["colour", "simple", ...photo];
    }
}

/** The card a thing opens on: Price tag where it has a price, else its first. */
export function firstStyle(item: ShareItem): CardStyle {
    const cards = cardsFor(item);
    return cards.includes("price") && item.price !== null
        ? "price"
        : (cards[0] ?? "simple");
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
 * deeper tints of them, at most four (one row beside Site colours and your own, in the share sheet), none
 * that reads the same as one already there, each `#rrggbb` once.
 */
export function shareSwatches(site: readonly string[], max = 4): string[] {
    const out: string[] = [];
    const add = (hex: string | null) => {
        if (!hex || out.length >= max) return;
        // Two that read as the same colour are one choice.
        if (out.some((o) => colourGap(o, hex) < NEAR)) return;
        out.push(hex);
    };
    for (const hex of site) add(normalHex(hex));
    for (const amount of [0.55, -0.35]) {
        for (const hex of site) add(tint(normalHex(hex), amount));
    }
    return out;
}

/** Below this, two colours read as one in a 36px swatch. */
const NEAR = 48;

/** Straight-line distance between two `#rrggbb` colours, 0 to 441. */
function colourGap(a: string, b: string): number {
    const ch = (h: string) =>
        [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [ch(a), ch(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
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
 * The link as the caption's chip shows it: no scheme, no query. What is
 * shared is the whole address; the chip is its name.
 * shortcut: the item's own address stands in for a short tagged link
 * (`/s/<code>`, board BCaption*); switch once the API mints short links.
 */
export function shownLink(url: string): string {
    try {
        const u = new URL(url);
        return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
    } catch {
        return url.replace(/^https?:\/\//, "");
    }
}

/**
 * The site colour a post's mark (its account's dot, an own post's tile)
 * is drawn in: the first that light text reads on, else none (the caller
 * falls back to ink). A site's white or cream is never a mark.
 */
export function markColour(
    swatches: readonly string[] | undefined,
): string | null {
    for (const hex of swatches ?? []) {
        const h = normalHex(hex);
        if (!h) continue;
        const [r, g, b] = [1, 3, 5].map((i) => {
            const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum < 0.3) return h;
    }
    return null;
}

/**
 * A colour's name for the colour row, from its hue and lightness: "Deep
 * green", "Light orange", "Charcoal". Swatches are read by name, never by hex.
 */
export function colourName(hex: string): string {
    const h6 = normalHex(hex);
    if (!h6) return "Colour";
    const [r, g, b] = [1, 3, 5].map(
        (i) => Number.parseInt(h6.slice(i, i + 2), 16) / 255,
    );
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (s < 0.12 || d < 0.06) {
        return l < 0.18
            ? "Black"
            : l < 0.4
              ? "Charcoal"
              : l < 0.75
                ? "Grey"
                : l < 0.93
                  ? "Stone"
                  : "White";
    }
    let h =
        max === r
            ? ((g - b) / d) % 6
            : max === g
              ? (b - r) / d + 2
              : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (l > 0.9) return h < 65 || h >= 345 ? "Cream" : "White";
    const hue =
        h < 15 || h >= 345
            ? "red"
            : h < 40
              ? l < 0.35
                  ? "brown"
                  : "orange"
              : h < 65
                ? "yellow"
                : h < 170
                  ? "green"
                  : h < 200
                    ? "teal"
                    : h < 255
                      ? "blue"
                      : h < 290
                        ? "purple"
                        : "pink";
    const shade = l < 0.32 ? "Deep " : l > 0.72 ? "Light " : "";
    const name = `${shade}${hue}`;
    return name.charAt(0).toUpperCase() + name.slice(1);
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
