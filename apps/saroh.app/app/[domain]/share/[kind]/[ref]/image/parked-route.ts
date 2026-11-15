// Parked: the API draws share pictures now (Takumi, apps/api.saroh.in/src/modules/share-posts/cards); next/og can't shape Indic scripts.
import { formatAmount } from "@saroh/site-blocks";

import { getBookingPage } from "@/lib/booking-page";
import { getCatalogueProduct } from "@/lib/catalogue";
import { getSiteForHost } from "@/lib/publication";
import { shareCard } from "@/lib/share-card";
import type { ShareCardInput } from "@/lib/share-card-model";
import { photoData } from "@/lib/share-photo";

/**
 * A live product's or service's share picture (#1375, plan 2026-11-12-002
 * U1): `/share/product/<slug>/image` or `/share/service/<id>/image` on the
 * site's own host, a PNG in the site's look (`lib/share-card.tsx`) that the
 * workspace fetches for the phone's share sheet and Download.
 *
 * Only what the site shows the public: a product its shop sells now (the
 * API answers by slug, for this site only), a service its booking page
 * offers now. Anything else, a test host included, is a 404; a read that
 * failed is a 503, never a picture of something else. The page cache never
 * keeps it (it keeps pages only); the answer says five minutes itself.
 */
export const dynamic = "force-dynamic";

type Found = ShareCardInput | "missing" | "unavailable";

const plain = (status: number, body: string) =>
    new Response(body, {
        status,
        headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
        },
    });

async function productCard(
    siteId: string,
    slug: string,
    business: string,
): Promise<Found> {
    const lookup = await getCatalogueProduct(siteId, slug);
    if (!lookup.ok) return lookup.reason;
    const product = lookup.data;
    // The cover is the first photo; a video never stands in for it.
    const cover = product.images.find((i) => i.kind !== "video");
    return {
        name: product.name,
        price: formatAmount(product.price, product.currency),
        business,
        photo: await photoData(cover?.url),
    };
}

async function serviceCard(
    siteId: string,
    id: string,
    business: string,
): Promise<Found> {
    const lookup = await getBookingPage(siteId);
    if (!lookup.ok) return lookup.reason;
    const { page } = lookup;
    const service = page.open
        ? page.services.find((s) => s.id === id)
        : undefined;
    if (!service) return "missing";
    const currency = service.currency ?? page.currency ?? "INR";
    return {
        name: service.name,
        price:
            service.priceCents === null
                ? null
                : formatAmount(String(service.priceCents / 100), currency),
        business,
        photo: null,
    };
}

export async function GET(
    _request: Request,
    {
        params,
    }: { params: Promise<{ domain: string; kind: string; ref: string }> },
) {
    const { domain, kind, ref } = await params;
    const site = await getSiteForHost(domain);
    if (!site?.siteId || site.mode === "test") return plain(404, "Not found");
    const business = site.snapshot.site.name;
    const found =
        kind === "product"
            ? await productCard(site.siteId, ref, business)
            : kind === "service"
              ? await serviceCard(site.siteId, ref, business)
              : "missing";
    if (found === "missing") return plain(404, "Not found");
    if (found === "unavailable") return plain(503, "Try again in a minute");
    return shareCard({
        ...found,
        variables: site.snapshot.site.styleVariables,
    });
}
