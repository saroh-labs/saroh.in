"use client";

import { useEffect, useState } from "react";

import type { LookId, RenderedGallery } from "@saroh/block-contract";

import { DEFAULT_API_URL } from "../api-url";
import { browsePriceWords } from "../lib/gst-price";
import { productCardsOf } from "../lib/product-grid-read";
import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { LookIcon } from "../look-icons";
import { formatAmount } from "../product/product-page";
import type { ShopListingCard } from "../product/shop-listing";
import { useQrSource } from "../qr-source";
import { said } from "./look-front";
import type { PublicService } from "./service-words";
import { servicePriceWords } from "./service-words";
import { focusRing, serviceHref } from "./services-cards";

type LookbookImage = RenderedGallery["images"][number];

/** A look's link words: a service is booked, a product is seen. */
export const LOOKBOOK_BOOK = "Book";
export const LOOKBOOK_SEE_PRODUCT = "See the product";
export const LOOKBOOK_SEE_PAGE = "Have a look";

/**
 * What the looks' links read live: the services by id, and each product by
 * its id (null: not on sale here now). Handed in by the catalog and tests.
 */
export interface LookbookLinked {
    services: PublicService[];
    products: Record<string, ShopListingCard | null>;
}

function isService(value: unknown): value is PublicService {
    const v = value as Record<string, unknown> | null;
    return (
        typeof v === "object" &&
        v !== null &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        typeof v.durationMinutes === "number"
    );
}

/**
 * Reads what the looks link to, once, after the page is drawn: the typed
 * words show first and the prices fill in. A read that fails leaves the
 * typed words (a gallery is the owner's, BLOCK-MAP: no could-not-load).
 */
function useLinked(
    images: LookbookImage[],
    apiUrl: string,
    siteId: string | null | undefined,
    given: LookbookLinked | undefined,
): LookbookLinked | null {
    const [read, setRead] = useState<LookbookLinked | null>(null);
    const ids = (kind: "service" | "product") =>
        Array.from(
            new Set(
                images.flatMap((i) => {
                    const id =
                        i.link?.kind !== kind
                            ? undefined
                            : kind === "service"
                              ? i.link.serviceId
                              : i.link.productId;
                    return id ? [id] : [];
                }),
            ),
        ).join(",");
    const serviceIds = ids("service");
    const productIds = ids("product");
    useEffect(() => {
        if (given || (!serviceIds && !productIds)) return;
        let active = true;
        const services = serviceIds
            ? fetch(
                  `${apiUrl}/public/services?ids=${encodeURIComponent(serviceIds)}`,
                  { headers: { accept: "application/json" } },
              )
                  .then((r) => (r.ok ? r.json() : []))
                  .then((body: unknown) =>
                      Array.isArray(body) ? body.filter(isService) : [],
                  )
                  .catch(() => [] as PublicService[])
            : Promise.resolve([] as PublicService[]);
        // shortcut: one read per product, because a shop card carries no
        // product id to match a batch by; fine for a lookbook's few looks,
        // a batch read by id when the shop API offers one.
        const products =
            productIds && typeof siteId === "string"
                ? Promise.all(
                      productIds.split(",").map(async (id) => {
                          try {
                              const r = await fetch(
                                  `${apiUrl}/public/sites/${encodeURIComponent(siteId)}/shop/products?source=picked&ids=${encodeURIComponent(id)}&count=1`,
                                  { headers: { accept: "application/json" } },
                              );
                              const cards = r.ok
                                  ? productCardsOf(await r.json())
                                  : null;
                              return [id, cards?.[0] ?? null] as const;
                          } catch {
                              return [id, null] as const;
                          }
                      }),
                  ).then((rows) => Object.fromEntries(rows))
                : Promise.resolve({});
        void Promise.all([services, products]).then(([s, p]) => {
            if (active) setRead({ services: s, products: p });
        });
        return () => {
            active = false;
        };
    }, [apiUrl, siteId, serviceIds, productIds, given]);
    return given ?? read;
}

/**
 * The `lookbook` look (DEC-228, LBGallery "Lookbook"): each photo is a way
 * in — the owner's name for the look set large over it, then what it links
 * to (a service, a product or a page), a from-price and a link: "Book" for
 * a service, opening booking on it; "See the product" for a product, which
 * stays when the product is sold out and says so in words; "Have a look"
 * for a page. The price the owner typed wins; else it is read from the
 * service or product, so it never drifts. A service no longer offered
 * leaves the photo and its name, with no price and no Book. A look with no
 * photo keeps its shape as a field in the accent colour, never a grey box.
 *
 * Cards stagger at a desk and are one row you swipe on a phone; the row
 * scrolls inside itself, never the page.
 */
export default function GalleryLookbook({
    content,
    look,
    apiUrl = DEFAULT_API_URL,
    siteId,
    bookHref,
    shopBase = "/shop",
    linked: given,
}: {
    content: RenderedGallery;
    look?: LookId;
    apiUrl?: string;
    /** The site, for its products' reads. Absent: products show typed words. */
    siteId?: string | null;
    /** The booking page; absent (a preview), Book is drawn, not followed. */
    bookHref?: string;
    /** Where product pages live. */
    shopBase?: string;
    linked?: LookbookLinked;
}) {
    const source = useQrSource();
    const images = (Array.isArray(content.images) ? content.images : []).filter(
        (img) => Boolean(img.src.trim()) || Boolean(img.name?.trim()),
    );
    const linked = useLinked(images, apiUrl, siteId, given);
    if (images.length === 0) return null;

    return (
        <section
            data-gallery-lookbook=""
            className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
        >
            <ul className="-mx-5 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto overscroll-x-contain px-5 pb-3 sm:mx-0 sm:px-0">
                {images.map((img, i) => {
                    const link = img.link;
                    const service =
                        link?.kind === "service"
                            ? linked?.services.find(
                                  (s) => s.id === link.serviceId,
                              )
                            : undefined;
                    const product =
                        link?.kind === "product" && link.productId
                            ? linked?.products[link.productId]
                            : undefined;
                    // Read and found missing: the service is gone.
                    const serviceGone =
                        link?.kind === "service" &&
                        linked !== null &&
                        service === undefined;
                    const name = said(img.name);
                    const what =
                        service?.name ?? product?.name ?? img.caption?.trim();
                    const typed = said(img.fromPrice);
                    const price = serviceGone
                        ? null
                        : (typed ??
                          (service
                              ? servicePriceWords(service)
                              : product
                                ? browsePriceWords(
                                      formatAmount(
                                          product.price,
                                          product.currency,
                                      ),
                                      product.gstAdded === true,
                                  )
                                : null));
                    const fromWord =
                        typed === null &&
                        price !== null &&
                        (service !== undefined || product?.priceFrom === true);
                    const soldOut = product?.soldOut === true;
                    const action = linkOf(img, {
                        bookHref,
                        shopBase,
                        product,
                        serviceGone,
                        source,
                    });
                    return (
                        <li
                            key={i}
                            data-lookbook-item=""
                            className={cn(
                                "border-site-border bg-site-surface flex w-[min(252px,78vw)] flex-none snap-start flex-col overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border",
                                i % 2 === 0 && "md:mt-10",
                            )}
                        >
                            <span
                                {...(link?.kind === "product"
                                    ? { "data-site-photo": "product" }
                                    : {})}
                                className={cn(
                                    "relative block h-[320px] overflow-hidden",
                                    !img.src.trim() &&
                                        "bg-site-accent text-site-accent-fg flex flex-col justify-between p-[18px]",
                                )}
                            >
                                {img.src.trim() ? (
                                    <>
                                        <img
                                            src={img.src}
                                            alt={img.alt ?? ""}
                                            width={img.width}
                                            height={img.height}
                                            {...siteImage("below", {
                                                src: img.src,
                                                width: img.width,
                                                sizes: "252px",
                                            })}
                                            className="h-full w-full object-cover"
                                        />
                                        {name ? (
                                            <span className="from-site-fg/80 to-site-fg/0 text-site-bg font-site-heading absolute inset-x-0 bottom-0 bg-gradient-to-t px-[18px] pb-4 pt-12 text-[calc(1.875rem*var(--site-heading-scale))] italic leading-none tracking-[-0.02em] [overflow-wrap:anywhere]">
                                                {name}
                                            </span>
                                        ) : null}
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[13px] font-semibold">
                                            {what}
                                        </span>
                                        <span className="font-site-heading text-[calc(1.875rem*var(--site-heading-scale))] italic leading-none tracking-[-0.02em] [overflow-wrap:anywhere]">
                                            {name}
                                        </span>
                                    </>
                                )}
                            </span>
                            <span className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-4 pb-1.5 pt-3.5">
                                {what ? (
                                    <span className="text-site-fg text-[16px] font-semibold">
                                        {what}
                                    </span>
                                ) : (
                                    <span />
                                )}
                                {price ? (
                                    <span
                                        className={cn(
                                            "font-site-heading text-right text-[17px] font-semibold tabular-nums",
                                            soldOut
                                                ? "text-site-muted"
                                                : "text-site-fg",
                                        )}
                                    >
                                        {fromWord ? (
                                            <small className="text-site-muted font-site-body mr-1 text-[13px] font-normal">
                                                from
                                            </small>
                                        ) : null}
                                        {price}
                                    </span>
                                ) : null}
                                {soldOut ? (
                                    <span
                                        data-sold-out=""
                                        className="text-site-fg col-span-2 text-[14px] font-semibold"
                                    >
                                        Sold out
                                    </span>
                                ) : null}
                            </span>
                            {action ? (
                                <span className="px-3 pb-1.5">{action}</span>
                            ) : (
                                <span className="h-3" />
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );

    function linkOf(
        img: LookbookImage,
        ctx: {
            bookHref?: string;
            shopBase: string;
            product: ShopListingCard | null | undefined;
            serviceGone: boolean;
            source: string | null;
        },
    ): React.ReactNode {
        const link = img.link;
        if (!link) return null;
        const words =
            link.kind === "service"
                ? LOOKBOOK_BOOK
                : link.kind === "product"
                  ? LOOKBOOK_SEE_PRODUCT
                  : link.kind === "page"
                    ? LOOKBOOK_SEE_PAGE
                    : null;
        if (words === null) return null;
        const href =
            link.kind === "service"
                ? ctx.serviceGone || !ctx.bookHref || !link.serviceId
                    ? null
                    : serviceHref(ctx.bookHref, link.serviceId, ctx.source)
                : link.kind === "product"
                  ? ctx.product
                      ? `${ctx.shopBase}/${encodeURIComponent(ctx.product.slug)}`
                      : null
                  : said(link.href);
        // A service no longer offered: no Book at all.
        if (link.kind === "service" && ctx.serviceGone) return null;
        const inner = (
            <>
                {words}
                <LookIcon name="arrow" look={look ?? "live"} size={16} />
            </>
        );
        const cls =
            "text-site-accent-text inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold";
        const name = said(img.name) ?? said(img.alt);
        return href ? (
            <a
                href={href}
                aria-label={name ? `${words}: ${name}` : undefined}
                className={cn(
                    cls,
                    "cursor-pointer rounded-sm underline-offset-4 hover:underline active:opacity-70",
                    focusRing,
                )}
            >
                {inner}
            </a>
        ) : (
            // The editor's canvas, or a read still on its way: the words
            // show, and go nowhere.
            <span className={cls}>{inner}</span>
        );
    }
}
