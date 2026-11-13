import {
    HttpException,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";

import {
    dayWords,
    moneyWords,
    moneyWordsMinor,
} from "../../common/words-format";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { PublicTimetableService } from "../bookings/public-timetable";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { discountState } from "../discounts/discount-state";
import { bpsToPercent } from "../discounts/serialize";
import { MediaService } from "../media/media.service";
import { OBJECT_STORAGE } from "../media/object-storage.provider";
import { parseGridQuery } from "../products/product-grid";
import { PublicCatalogueService } from "../products/public-catalogue.service";
import { SitesService } from "../sites/sites.service";
import { curatedFont, siteFamilies } from "./cards/card-fonts";
import type { ShareOffer } from "./cards/card-model";
import {
    hexColourOf,
    shareSizeOf,
    shareStyleOf,
    shareWidthOf,
} from "./cards/card-model";
import type { CardRender } from "./cards/card-renderer";
import { renderCard } from "./cards/card-renderer";
import { BOOK_HEADLINE, shareHeadlineOf } from "./dto";

/**
 * Share pictures (#1375, #1378; plan 2026-11-12-003 U5, U6), drawn here
 * with Takumi because next/og can't shape Indian scripts:
 *
 *   GET /public/share/:siteId/:kind/:ref/image   product | service | post | book | offer
 *   GET /public/share/own/:id/image               a business's own post
 *
 * - **Only what the live site shows.** Each kind is read the way its
 *   public page is (the shop's product read, the booking page, the post's
 *   current publication), from the site's LIVE publication. A draft, a
 *   hidden item, an expired offer, another business's anything: 404, all
 *   alike.
 * - **Only the business's own photos,** read from storage by key, never
 *   fetched from an address: nothing here can be pointed elsewhere.
 * - **Words as text.** What a merchant wrote is drawn, never parsed.
 * - **Limited per visitor:** each picture is real work.
 */

/** Pictures per visitor per minute: a share sheet asks a handful. */
const RENDERS_PER_WINDOW = 60;
const RENDER_WINDOW_MS = 60_000;
/** The most of a photo read; one larger draws the tile. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const SHARE_KINDS = [
    "product",
    "service",
    "post",
    "book",
    "offer",
] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export interface ShareQuery {
    style?: unknown;
    size?: unknown;
    font?: unknown;
    /** The card's own ground and text colours, `#rrggbb` (anything else is ignored). */
    bg?: unknown;
    fg?: unknown;
    /**
     * The booking page card's headline, typed in the share sheet. Read only
     * by the organization's own route; the public one ignores it.
     */
    headline?: unknown;
    /** A thumbnail's width in pixels, up to 540. */
    w?: unknown;
    /** On an offer: the product being shared, by its slug. */
    product?: unknown;
}

/** What a card says, before the site's look and fonts are added. */
type Content = Pick<
    CardRender,
    "name" | "price" | "unit" | "offer" | "cta" | "kindLabel"
> & {
    photoUrl?: string | null;
    photoMediaId?: string | null;
};

interface LiveSite {
    siteId: string;
    organizationId: string;
    name: string;
    variables: Record<string, string> | null;
    look: unknown;
    socialImage: string | null;
    iconUrl: string | null;
    address: string;
}

/** Every miss looks the same. */
function notFound(): never {
    throw new NotFoundException("Nothing to show here");
}

const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** A product's cover: its first photo, or a first video's poster. */
function coverOf(
    images: readonly { kind: string; url: string; posterUrl: string | null }[],
): string | null {
    if (images.length === 0) return null;
    const [first] = images;
    return first.kind === "video" ? first.posterUrl : first.url;
}

/** "Sat 15 Nov, 07:00" from the timetable's own date and time. */
export function classWhen(date: string, time: string): string {
    const day = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) return time;
    return `${dayWords(day, "UTC", { weekday: true })}, ${time}`;
}

/**
 * When an offer ends, as its badge says it: "this week only" within seven
 * days, else the day. shortcut: the day is UTC's; read the business's zone
 * when an offer near midnight shows the wrong day.
 */
export function offerUntil(endsAt: Date | null, now: Date): string | null {
    if (!endsAt) return null;
    if (endsAt.getTime() - now.getTime() <= 7 * 86_400_000) {
        return "this week only";
    }
    return `until ${dayWords(endsAt, "UTC")}`;
}

@Injectable()
export class PublicShareService {
    constructor(
        private readonly sites: SitesService,
        private readonly catalogue: PublicCatalogueService,
        private readonly bookings: PublicBookingsService,
        private readonly timetable: PublicTimetableService,
        private readonly media: MediaService,
        @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
        // Not a DI provider: a per-instance default tests can replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            RENDERS_PER_WINDOW,
            RENDER_WINDOW_MS,
        ),
    ) {}

    /** A live item's picture. */
    async item(
        siteId: string,
        kind: string,
        ref: string,
        query: ShareQuery,
        visitor: string,
    ): Promise<Buffer> {
        this.take(visitor);
        if (!(SHARE_KINDS as readonly string[]).includes(kind)) notFound();
        const site = await this.liveSite(siteId);
        const content = await this.content(
            site,
            kind as ShareKind,
            ref,
            visitor,
            // The public picture never draws words from its address.
            {
                product:
                    typeof query.product === "string" ? query.product : null,
            },
        );
        return this.draw(site, content, query);
    }

    /**
     * The booking page's card with the headline typed in the share sheet
     * (owner, 12 Nov 2026): for the business's own people only, through
     * `organizations/:id/share/book/image`, never the public route, so
     * nobody can draw their words in a business's look. Capped and
     * cleaned (`shareHeadlineOf`), drawn as text, never stored.
     */
    async bookForOrganization(
        organizationId: string,
        query: ShareQuery,
        visitor: string,
    ): Promise<Buffer> {
        this.take(visitor);
        const site = await this.liveSite(await this.liveSiteId(organizationId));
        const content = await this.content(site, "book", "page", visitor, {
            headline: shareHeadlineOf(query.headline),
        });
        return this.draw(site, content, query);
    }

    /**
     * A business's own post: drawn on its live site's look, and only while
     * it has one. The id is the post's, unguessable.
     */
    async own(id: string, query: ShareQuery, visitor: string): Promise<Buffer> {
        this.take(visitor);
        const post = await prisma.sharePost.findUnique({
            where: { id },
            select: {
                organizationId: true,
                headline: true,
                mediaId: true,
                style: true,
                size: true,
            },
        });
        if (!post) notFound();
        const site = await this.liveSite(
            await this.liveSiteId(post.organizationId),
        );
        if (site.organizationId !== post.organizationId) notFound();
        return this.draw(
            site,
            {
                name: post.headline ?? "",
                price: null,
                photoMediaId: post.mediaId,
            },
            {
                ...query,
                style: query.style ?? post.style,
                size: query.size ?? post.size,
            },
        );
    }

    /** The business's live site: its first, as the own post's picture reads it. */
    private async liveSiteId(organizationId: string): Promise<string> {
        const live = await prisma.site.findFirst({
            where: {
                organizationId,
                deletedAt: null,
                currentPublication: { kind: "LIVE" },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true },
        });
        if (!live) notFound();
        return live.id;
    }

    private take(visitor: string): void {
        if (!this.limiter.take(visitor)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
    }

    /** The site's live publication, or a 404 (`getPublicationBySiteId`). */
    private async liveSite(siteId: string): Promise<LiveSite> {
        const view = await this.sites.getPublicationBySiteId(siteId);
        if (!view.organizationId) notFound();
        const snapshot = (view.snapshot ?? {}) as {
            site?: Record<string, unknown>;
        };
        const s = snapshot.site ?? {};
        const variables =
            s.styleVariables && typeof s.styleVariables === "object"
                ? (s.styleVariables as Record<string, string>)
                : null;
        const social =
            s.socialImage && typeof s.socialImage === "object"
                ? text((s.socialImage as { url?: unknown }).url)
                : null;
        return {
            siteId,
            organizationId: view.organizationId,
            name: text(s.name) ?? "",
            variables,
            look: s.look,
            socialImage: social ?? text(s.socialImageUrl),
            iconUrl: view.icon?.url ?? null,
            address: view.primaryHost ?? "",
        };
    }

    private async content(
        site: LiveSite,
        kind: ShareKind,
        ref: string,
        visitor: string,
        /**
         * The booking page's headline (the organization's own route only),
         * and on an offer the product being shared.
         */
        {
            headline = null,
            product = null,
        }: {
            headline?: string | null;
            product?: string | null;
        },
    ): Promise<Content> {
        switch (kind) {
            case "product": {
                const product = await this.catalogue.product(
                    site.siteId,
                    ref,
                    visitor,
                );
                return {
                    name: product.name,
                    price: moneyWords(product.price, product.currency),
                    photoUrl: coverOf(product.images),
                };
            }
            case "service": {
                const page = await this.bookings.publicBookingPage(site.siteId);
                const service = page.open
                    ? page.services.find((s) => s.id === ref)
                    : undefined;
                if (!service) notFound();
                const currency = service.currency ?? page.currency ?? "INR";
                let unit = `${service.durationMinutes} min`;
                if (service.kind === "class") {
                    // A class shows when it next meets, when it does this week.
                    const week = await this.timetable
                        .read(site.siteId, [service.id], visitor)
                        .catch(() => null);
                    const next = week?.sessions[0];
                    if (next)
                        unit = `Next class ${classWhen(next.date, next.time)}`;
                }
                return {
                    name: service.name,
                    price:
                        service.priceCents === null
                            ? null
                            : moneyWordsMinor(service.priceCents, currency),
                    unit,
                    photoUrl: site.socialImage,
                };
            }
            case "post": {
                const view = await this.sites.getPublicPost(site.siteId, ref);
                const post = (
                    view.snapshot as { post?: Record<string, unknown> }
                ).post;
                const title = text(post?.title);
                if (!title) notFound();
                return {
                    name: title,
                    price: null,
                    cta: "Read more",
                    kindLabel: "From the blog",
                    photoUrl: text(post?.image),
                };
            }
            case "book": {
                const page = await this.bookings.publicBookingPage(site.siteId);
                if (!page.open) notFound();
                return {
                    // The sheet's headline, never stored; else the default.
                    name: headline ?? BOOK_HEADLINE,
                    price: null,
                    cta: "Book now",
                    kindLabel: "Bookings",
                    photoUrl: site.socialImage,
                };
            }
            case "offer":
                return this.offer(site, ref, visitor, product);
        }
    }

    /**
     * A live discount (in date and not used up) and what it applies to:
     * one product the shop sells, with its old and new price, else the shop.
     * `product` (a slug) is the one being shared: a discount on several
     * draws that one, and only if the discount is on it (else a 404); with
     * none, the first it is on.
     */
    private async offer(
        site: LiveSite,
        id: string,
        visitor: string,
        product: string | null,
    ): Promise<Content> {
        const discount = await prisma.discount.findFirst({
            where: { id, organizationId: site.organizationId },
            select: {
                code: true,
                description: true,
                kind: true,
                percentBps: true,
                amount: true,
                currency: true,
                appliesTo: true,
                startsAt: true,
                endsAt: true,
                usageLimit: true,
                products: {
                    where: {
                        product: {
                            status: "PUBLISHED",
                            ...(product ? { slug: product } : {}),
                        },
                    },
                    orderBy: { id: "asc" },
                    take: 1,
                    select: { product: { select: { slug: true } } },
                },
                _count: { select: { redemptions: true } },
            },
        });
        const now = new Date();
        if (
            !discount ||
            discountState(discount, discount._count.redemptions, now) !==
                "ACTIVE"
        ) {
            notFound();
        }
        const headline =
            discount.kind === "PERCENTAGE" && discount.percentBps !== null
                ? `${bpsToPercent(discount.percentBps)}% off`
                : discount.amount !== null
                  ? `${moneyWords(discount.amount, discount.currency ?? "INR")} off`
                  : notFound();
        const offer: ShareOffer = {
            headline,
            until: offerUntil(discount.endsAt, now),
            code: discount.code,
        };
        const slug = discount.products[0]?.product.slug;
        if (discount.appliesTo === "PRODUCT") {
            if (!slug) notFound();
            const item = await this.catalogue.product(
                site.siteId,
                slug,
                visitor,
            );
            const was = Math.round(Number(item.price) * 100);
            const now =
                discount.kind === "PERCENTAGE"
                    ? Math.round(
                          (was * (10_000 - (discount.percentBps ?? 0))) /
                              10_000,
                      )
                    : discount.currency === item.currency
                      ? Math.max(
                            0,
                            was - Math.round(Number(discount.amount) * 100),
                        )
                      : null;
            return {
                name: item.name,
                price: moneyWords(item.price, item.currency),
                offer: {
                    ...offer,
                    ...(now === null
                        ? {}
                        : {
                              was: moneyWordsMinor(was, item.currency),
                              now: moneyWordsMinor(now, item.currency),
                          }),
                },
                photoUrl: coverOf(item.images),
            };
        }
        // The whole shop, or a storefront or collection of it: the shop must
        // be open, as its page is (a one-product grid: the least to ask).
        await this.catalogue.list(
            site.siteId,
            visitor,
            parseGridQuery({ source: "newest", count: "1" }),
        );
        return {
            name: text(discount.description) ?? site.name,
            price: null,
            offer,
            photoUrl: site.socialImage,
        };
    }

    private async draw(
        site: LiveSite,
        content: Content,
        query: ShareQuery,
    ): Promise<Buffer> {
        const families = siteFamilies(site.variables, site.look);
        const chosen = curatedFont(query.font);
        const [photo, logo] = await Promise.all([
            content.photoMediaId
                ? this.media
                      .readReadyObjectStart(
                          site.organizationId,
                          content.photoMediaId,
                          MAX_PHOTO_BYTES,
                      )
                      .then((read) => read?.bytes ?? null)
                      .catch(() => null)
                : this.photo(site.organizationId, content.photoUrl),
            this.photo(site.organizationId, site.iconUrl),
        ]);
        return renderCard({
            style: shareStyleOf(
                typeof query.style === "string" ? query.style : null,
            ),
            size: shareSizeOf(
                typeof query.size === "string" ? query.size : null,
            ),
            name: content.name,
            price: content.price,
            unit: content.unit ?? null,
            cta: content.cta ?? null,
            kindLabel: content.kindLabel ?? null,
            offer: content.offer ?? null,
            business: site.name,
            address: site.address,
            variables: site.variables,
            ground: hexColourOf(query.bg),
            ink: hexColourOf(query.fg),
            width: shareWidthOf(query.w),
            photo,
            logo,
            fonts: {
                heading: chosen ?? families.heading,
                body: families.body,
            },
        });
    }

    /**
     * One of the business's own photos by its public address, read from
     * storage. Anything not under its own key, or not the address storage
     * gives that key, is none. Never throws.
     */
    private async photo(
        organizationId: string,
        url: string | null | undefined,
    ): Promise<Uint8Array | null> {
        if (!url) return null;
        try {
            // The key is the address's path from `org/` (storage may sit
            // under a prefix), and must be this business's.
            const path = decodeURIComponent(new URL(url).pathname);
            const at = path.indexOf("/org/");
            const key = at < 0 ? "" : path.slice(at + 1);
            if (!key.startsWith(`org/${organizationId.toLowerCase()}/`)) {
                return null;
            }
            if (this.storage.getPublicUrl(key) !== url) return null;
            return await this.storage.readObjectStart(key, MAX_PHOTO_BYTES);
        } catch {
            return null;
        }
    }
}
