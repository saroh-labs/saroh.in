/**
 * Share as a post (#1375, plan 2026-11-12-003 U2): what one live item's
 * share sheet needs, and the addresses it opens. Pure and client-safe.
 *
 * The pictures are the API's (`GET public/share/:siteId/:kind/:ref/image`,
 * public, open CORS): four styles in three sizes, in the business's own
 * look. The link is the item's live page, tagged so a visit from a post is
 * counted.
 */

export const CARD_STYLES = ["photo", "price", "offer", "simple"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const CARD_SIZES = ["post", "square", "story"] as const;
export type CardSize = (typeof CARD_SIZES)[number];

/** One live thing to share: a product (by slug) or a service (by id). */
export interface ShareItem {
    kind: "product" | "service";
    /** The API's ref: a product's slug, a service's id. */
    ref: string;
    name: string;
    /** "₹360", "₹300 to ₹500"; null with no price. */
    price: string | null;
    /** Its live page, untagged. */
    url: string;
    /** A live discount on it: the Offer card is drawn only with one. */
    offerId: string | null;
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
}

/** The add-ons on Plan and billing, where Saroh Social will be added. */
export const ADD_ONS_HREF = "/settings/billing#add-ons";

/** The cards an item has: Offer only while a discount on it is live. */
export function cardsFor(item: ShareItem): CardStyle[] {
    return CARD_STYLES.filter((s) => s !== "offer" || item.offerId !== null);
}

/** The picture for one card at one size. */
export function cardImageUrl(
    setup: Pick<ShareSetup, "apiOrigin" | "siteId">,
    item: ShareItem,
    style: CardStyle,
    size: CardSize,
): string {
    const [kind, ref] =
        style === "offer" && item.offerId
            ? ["offer", item.offerId]
            : [item.kind, item.ref];
    const base = setup.apiOrigin.replace(/\/+$/, "");
    const q = new URLSearchParams({ style, size });
    return `${base}/public/share/${encodeURIComponent(setup.siteId)}/${kind}/${encodeURIComponent(ref)}/image?${q.toString()}`;
}

/** The item's page, tagged so Saroh can count visits from a post (R5). */
export function taggedLink(url: string): string {
    try {
        const u = new URL(url);
        u.searchParams.set("utm_source", "saroh-share");
        u.searchParams.set("utm_medium", "social");
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
