import { formatMoney, formatMoneyMajor } from "@/lib/format/money";
import type { ShareItem } from "@/lib/share-item/share";

/**
 * Create post's pick step (#1378, boards SGPickDesk and SGPickPhone): what
 * the business can post about, recent first. Only what is live on its site
 * can be picked; a draft is listed greyed with why, never hidden. A single
 * booking is never listed: it is private and has no page. Pure.
 */

export type PickKind = "product" | "service" | "post" | "offer" | "book";

export const PICK_FILTERS = [
    "all",
    "product",
    "service",
    "post",
    "offer",
    "book",
] as const;
export type PickFilter = (typeof PICK_FILTERS)[number];

export const FILTER_NAMES: Record<PickFilter, string> = {
    all: "All",
    product: "Products",
    service: "Services and classes",
    post: "Blog posts",
    offer: "Offers",
    book: "Booking page",
};

/** One row of the list. */
export interface PickRow {
    key: string;
    kind: PickKind;
    name: string;
    /** "Product · ₹360", "Blog post · not published". */
    line: string;
    image: string | null;
    /** What it shares; null for a draft, which can't be picked. */
    item: ShareItem | null;
    /** For recent first; ISO. */
    at: string;
}

/** What the pick step reads; each null when it couldn't be read. */
export interface PickSources {
    products: readonly {
        id: string;
        name: string;
        slug?: string | null;
        status: string;
        price: string;
        currency: string;
        image: string | null;
        updatedAt: string;
    }[];
    services: readonly {
        id: string;
        name: string;
        status: string;
        showOnBookingPage: boolean;
        capacity: number;
        priceCents: number | null;
        currency: string | null;
        updatedAt: string;
    }[];
    posts: readonly {
        id: string;
        title: string;
        slug: string;
        excerpt: string | null;
        image: string | null;
        live: boolean;
        publishedAt: string | null;
        createdAt: string;
        updatedAt?: string;
    }[];
    offers: readonly {
        id: string;
        code: string;
        description: string | null;
        kind: string;
        percent: string | null;
        amount: string | null;
        currency: string | null;
        endsAt: string | null;
        state: string;
    }[];
    booking: { state: "none" | "draft" | "live"; url: string | null } | null;
    /** The live links (`WebAddressLinks`): each null while its page isn't live. */
    links: { site: string | null; shop: string | null; book: string | null };
    /** The site's blog prefix; null is "blog". */
    postsPrefix: string | null;
}

/** The one reason a draft can't be picked (SGPick*). */
export const DRAFT_WHY = "Publish it first. A draft has no public page.";

const shortDay = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
        new Date(iso),
    );

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** Every row, recent first. */
export function pickRows(src: PickSources): PickRow[] {
    const rows: PickRow[] = [];
    const { site, shop, book } = src.links;

    for (const p of src.products) {
        if (p.status === "ARCHIVED") continue;
        const price = formatMoneyMajor(p.price, p.currency);
        const live = p.status === "PUBLISHED" && !!p.slug && !!shop;
        rows.push({
            key: `product:${p.id}`,
            kind: "product",
            name: p.name,
            line: live ? `Product · ${price}` : "Product · not published",
            image: p.image,
            at: p.updatedAt,
            item:
                live && p.slug && shop
                    ? {
                          kind: "product",
                          ref: p.slug,
                          name: p.name,
                          price,
                          url: `${trimSlash(shop)}/${encodeURIComponent(p.slug)}`,
                          offerId: null,
                      }
                    : null,
        });
    }

    for (const s of src.services) {
        // Booked by the team alone: no page a post could send anyone to.
        if (s.status !== "ACTIVE" || !s.showOnBookingPage) continue;
        const what = s.capacity > 1 ? "Class" : "Service";
        const price = formatMoney(s.priceCents, s.currency);
        rows.push({
            key: `service:${s.id}`,
            kind: "service",
            name: s.name,
            line: book
                ? [what, price].filter(Boolean).join(" · ")
                : `${what} · not published`,
            image: null,
            at: s.updatedAt,
            item: book
                ? {
                      kind: "service",
                      ref: s.id,
                      name: s.name,
                      price,
                      url: `${trimSlash(book)}?service=${encodeURIComponent(s.id)}`,
                      offerId: null,
                  }
                : null,
        });
    }

    for (const p of src.posts) {
        const live = p.live && !!site;
        rows.push({
            key: `post:${p.id}`,
            kind: "post",
            name: p.title,
            line:
                live && p.publishedAt
                    ? `Blog post · ${shortDay(p.publishedAt)}`
                    : live
                      ? "Blog post"
                      : "Blog post · not published",
            image: p.image,
            at: p.publishedAt ?? p.updatedAt ?? p.createdAt,
            item:
                live && site
                    ? {
                          kind: "post",
                          ref: p.slug,
                          name: p.title,
                          price: null,
                          url: `${trimSlash(site)}/${src.postsPrefix ?? "blog"}/${p.slug}`,
                          offerId: null,
                          hasPhoto: !!p.image,
                          summary: p.excerpt,
                      }
                    : null,
        });
    }

    // Only a live discount has a card: the shop must be open for it.
    for (const d of src.offers) {
        if (d.state !== "ACTIVE" || !shop) continue;
        const off =
            d.kind === "PERCENTAGE" && d.percent
                ? `${d.percent}% off`
                : `${formatMoneyMajor(d.amount, d.currency) ?? ""} off`;
        const described = d.description?.trim() ?? "";
        const name = described === "" ? off : described;
        rows.push({
            key: `offer:${d.id}`,
            kind: "offer",
            name,
            line: [
                "Offer",
                `code ${d.code}`,
                d.endsAt ? `ends ${shortDay(d.endsAt)}` : null,
            ]
                .filter(Boolean)
                .join(" · "),
            image: null,
            at: d.endsAt ?? "",
            item: {
                kind: "offer",
                ref: d.id,
                name,
                price: null,
                url: shop,
                offerId: d.id,
            },
        });
    }

    rows.sort((a, b) => b.at.localeCompare(a.at));

    // The booking page sits with the rest, at the top: it is always there.
    if (src.booking && src.booking.state !== "none") {
        const live = src.booking.state === "live" && !!book;
        rows.unshift({
            key: "book:page",
            kind: "book",
            name: "Booking page",
            line: live
                ? "Booking page · /book"
                : "Booking page · not published",
            image: null,
            at: "",
            item:
                live && book
                    ? {
                          kind: "book",
                          ref: "page",
                          name: "your booking page",
                          price: null,
                          url: book,
                          offerId: null,
                      }
                    : null,
        });
    }
    return rows;
}

/** The rows a filter and a search leave. */
export function filterRows(
    rows: readonly PickRow[],
    filter: PickFilter,
    search: string,
): PickRow[] {
    const term = search.trim().toLowerCase();
    return rows.filter(
        (r) =>
            (filter === "all" || r.kind === filter) &&
            (!term || r.name.toLowerCase().includes(term)),
    );
}

/** "Continue with the blog post" (SGPickPhone). */
export const CONTINUE_WITH: Record<PickKind, string> = {
    product: "Continue with the product",
    service: "Continue with the service",
    post: "Continue with the blog post",
    offer: "Continue with the offer",
    book: "Continue with the booking page",
};
