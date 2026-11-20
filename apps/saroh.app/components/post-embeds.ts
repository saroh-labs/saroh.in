import type { ShopListingCard } from "@saroh/site-blocks";
import {
    formatAmount,
    formatDuration,
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
    /<div data-embed="(service|product)" data-id="([A-Za-z0-9_-]{1,64})"><\/div>/g;

export type EmbedKind = "service" | "product";

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
    const out: Record<EmbedKind, string[]> = { service: [], product: [] };
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

const CARD =
    "not-prose my-6 flex min-w-0 items-center gap-4 rounded-[calc(var(--site-radius)*1.4)] border border-site-border bg-site-surface p-4 text-site-fg";
const NAME =
    "m-0 font-site-heading text-[calc(1.1875rem*var(--site-heading-scale))] font-semibold leading-tight [overflow-wrap:anywhere]";
const LINE = "m-0 mt-1 text-sm tabular-nums text-site-body";
const BUTTON =
    "coarse:h-11 inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-[var(--site-radius)] bg-site-accent px-3.5 text-[13.5px] font-bold text-site-accent-fg no-underline hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg";

function card(
    body: { name: string; line: string; image?: ShopListingCard["image"] },
    href: string,
    words: string,
): string {
    const img = body.image
        ? `<img src="${escape(body.image.url)}" alt="${escape(body.image.alt)}" loading="lazy" class="m-0 size-16 shrink-0 rounded-[var(--site-radius)] object-cover">`
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
    },
): string {
    return html.replace(EMBED, (_, kind: EmbedKind, id: string) => {
        if (kind === "service") {
            const s = found.services?.get(id);
            return s ? serviceCard(s) : "";
        }
        const p = found.products?.get(id);
        return p ? productCard(p) : "";
    });
}
