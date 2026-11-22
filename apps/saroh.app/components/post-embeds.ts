import type { ShopListingCard } from "@saroh/site-blocks";
import {
    formatAmount,
    formatDuration,
    POST_EMBED_CARD,
    servicePriceWords,
} from "@saroh/site-blocks";

/**
 * A post's cards from the business (U15b), drawn into its HTML.
 *
 * A post stores only `<div data-embed="service|product" data-id="…"></div>`,
 * exactly as `api.saroh.in/src/modules/sites/sanitize.ts` writes it at
 * publish. The page fills each one from what Services and Products say
 * when it is viewed, so a changed price shows with no republish, and a
 * card whose service or product is gone (deleted, archived, no longer
 * offered or sold) is left out rather than shown stale.
 *
 * The card is built as a string because the body is one HTML string: a
 * card sitting inside a quote or a list stays where it is. Every value from
 * the API is escaped; ids passed the sanitizer's own id rule.
 *
 * Pure, so it is tested without a server. Here, not in `lib/`, so Tailwind
 * sees its classes.
 */

export const EMBED =
    /<div data-embed="(service|product|book|offer)" data-id="([A-Za-z0-9_-]{1,64})"><\/div>/g;

/** `book` is a Book now button for a service, `offer` a live discount (W2). */
export type EmbedKind = "service" | "product" | "book" | "offer";

/** A live offer's words (API `public/sites/:siteId/offers/:id`). */
export interface EmbedOffer {
    name: string;
    headline: string;
    until: string | null;
    code: string;
}

/** What a service card needs: what the booking page offers now. */
export interface EmbedService {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
    gst?: Parameters<typeof servicePriceWords>[0]["gst"];
}

/** The ids of each kind a post's body names, each once. */
export function embedsIn(html: string): Record<EmbedKind, string[]> {
    const out: Record<EmbedKind, string[]> = {
        service: [],
        product: [],
        book: [],
        offer: [],
    };
    html.replace(EMBED, (match, kind: EmbedKind, id: string) => {
        if (!out[kind].includes(id)) out[kind].push(id);
        return match;
    });
    return out;
}

const escape = (text: string) =>
    text.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c] ?? c,
    );

const {
    card: CARD,
    name: NAME,
    line: LINE,
    button: BUTTON,
    image: IMAGE,
} = POST_EMBED_CARD;

function card(
    body: { name: string; line: string; image?: ShopListingCard["image"] },
    href: string,
    words: string,
): string {
    const img = body.image
        ? `<img src="${escape(body.image.url)}" alt="${escape(body.image.alt)}" loading="lazy" class="${IMAGE}">`
        : "";
    return `<div class="${CARD}" data-post-card="">${img}<div class="min-w-0 flex-1"><p class="${NAME}">${escape(body.name)}</p><p class="${LINE}">${escape(body.line)}</p></div><a href="${escape(href)}" class="${BUTTON}" aria-label="${escape(`${words}: ${body.name}`)}">${escape(words)}</a></div>`;
}

export function serviceCard(service: EmbedService): string {
    const price = servicePriceWords(service);
    const line = [formatDuration(service.durationMinutes), price]
        .filter(Boolean)
        .join(" · ");
    return card(
        { name: service.name, line },
        `/book?service=${encodeURIComponent(service.id)}`,
        "Book now",
    );
}

export function productCard(product: ShopListingCard): string {
    const amount = formatAmount(product.price, product.currency);
    const price = `${product.priceFrom ? "From " : ""}${amount}${product.gstAdded ? " + GST" : ""}`;
    return card(
        {
            name: product.name,
            line: product.soldOut ? `${price} · Sold out` : price,
            image: product.image,
        },
        `/shop/${encodeURIComponent(product.slug)}`,
        "See it",
    );
}

/** A Book now button for one service (W2), as a post's button draws. */
export function bookButton(service: EmbedService): string {
    return `<p data-button="link"><a href="/book?service=${encodeURIComponent(service.id)}" aria-label="${escape(`Book now: ${service.name}`)}">Book now</a></p>`;
}

/** A live offer (W2): how much off, until when, the code, and the shop. */
export function offerCard(offer: EmbedOffer): string {
    const line = [offer.until, offer.code ? `Code ${offer.code}` : null]
        .filter(Boolean)
        .join(" · ");
    return card(
        { name: `${offer.headline} · ${offer.name}`, line },
        "/shop",
        "Shop now",
    );
}

/** Lower-case words joined by hyphens: a heading's anchor. */
function anchorOf(text: string): string {
    return (
        text
            .toLowerCase()
            // Spaces and ASCII punctuation go; letters of any script stay.
            .replace(/[\s!-/:-@[-`{-~]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "part"
    );
}

const CONTENTS = /<div data-contents="headings"><\/div>/g;
/** An `<h2>` the sanitizer wrote: only a `style` may sit on it. */
const H2 = /<h2((?: style="[^"]*")?)>([\s\S]*?)<\/h2>/g;

/**
 * The contents list (W2): each `<h2>` gets an anchor, and the post's
 * `data-contents` block lists them. Words are the heading's text, tags
 * dropped and escaped again. A post with no contents block is unchanged.
 */
export function fillContents(html: string): string {
    if (!html.includes('data-contents="headings"')) return html;
    const seen = new Map<string, number>();
    const parts: { id: string; text: string }[] = [];
    const out = html.replace(H2, (_, style: string, inner: string) => {
        // Until nothing changes: `<sc<b>ript>` is a tag again after one pass.
        let words = inner;
        for (let before = ""; before !== words;) {
            before = words;
            words = words.replace(/<[^>]*>/g, "");
        }
        const text = words.replace(/&nbsp;/g, " ").trim();
        let id = anchorOf(text.replace(/&[a-z#0-9]+;/gi, ""));
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n > 0) id = `${id}-${n + 1}`;
        parts.push({ id, text });
        return `<h2 id="${id}"${style}>${inner}</h2>`;
    });
    // The text is already escaped HTML from the sanitizer, tags dropped.
    const list = parts.length
        ? `<div data-contents="headings"><p class="m-0 text-sm font-semibold text-site-fg">In this post</p><ol class="m-0 mt-2 grid list-decimal gap-1 pl-5 text-sm">${parts
              .map(
                  (p) =>
                      `<li><a href="#${p.id}" class="text-site-accent-text">${p.text}</a></li>`,
              )
              .join("")}</ol></div>`
        : "";
    return out.replace(CONTENTS, list);
}

/**
 * The body with each card filled in. A card whose thing isn't found draws
 * nothing; `null` for a kind means its read failed, and its cards draw
 * nothing too (the page is then not kept, `lib/post-embeds.ts`).
 */
export function fillPostEmbeds(
    html: string,
    found: {
        services: ReadonlyMap<string, EmbedService> | null;
        products: ReadonlyMap<string, ShopListingCard> | null;
        offers?: ReadonlyMap<string, EmbedOffer> | null;
    },
): string {
    return html.replace(EMBED, (_, kind: EmbedKind, id: string) => {
        if (kind === "service" || kind === "book") {
            const s = found.services?.get(id);
            if (!s) return "";
            return kind === "book" ? bookButton(s) : serviceCard(s);
        }
        if (kind === "offer") {
            const o = found.offers?.get(id);
            return o ? offerCard(o) : "";
        }
        const p = found.products?.get(id);
        return p ? productCard(p) : "";
    });
}
