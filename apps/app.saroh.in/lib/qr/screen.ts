import type { QrStyleLock } from "@/components/qr/qr-style-lock";
import { qrStyleLock } from "@/components/qr/qr-style-lock";
import { apiFetch, orgBase } from "@/lib/api/http";
import type { Organization } from "@/lib/organizations/service";
import { readOrganizationSettings } from "@/lib/organizations/settings-service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import type { SiteDetail, SiteSummary } from "@/lib/sites/service";
import { listSites } from "@/lib/sites/service";
import type { WebAddressLinks } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";

import { qrSwatches } from "./colours";
import { logoDataUrl } from "./logo-data";
import { initialsOf, pickShareSite } from "./pick";
import { listQrCodes } from "./service";
import type { QrTargets } from "./targets";
import { buildQrTargets, publishedFreePages } from "./targets";
import type { QrCodesView } from "./types";

/**
 * Everything Settings › Share › QR codes draws, read once on the server.
 *
 * **Which site.** The business's own (`pickShareSite`): the one at its web
 * address, else the first the API lists.
 *
 * **Two kinds of read.** The site list and its codes are the page: a failure
 * throws to the tab's boundary, and a 403 is `forbidden()`. Everything that
 * only fills the pickers (the site's pages and look, the shop's products,
 * the plan, the logo) is an aid: unreadable, it is left out, and the API
 * still refuses a save it wouldn't take.
 */

export interface QrScreenBusiness {
    name: string;
    /** For the tile in a branded code with no logo. */
    initials: string;
    /** The logo as a `data:` URL; null: none set, or it couldn't be had. */
    logo: string | null;
    /** A logo is set, whether or not its bytes could be had. */
    hasLogo: boolean;
}

export type QrScreen =
    | { state: "no-site" }
    | {
          state: "ready";
          site: { id: string; name: string };
          view: QrCodesView;
          /** `site:update`: may make, change and retire. */
          canChange: boolean;
          targets: QrTargets;
          /** Where customers go, for the line under a target's name. */
          displayOrigin: string | null;
          swatches: string[];
          lock: QrStyleLock | null;
          business: QrScreenBusiness;
      };

/** An optional read: the body, or null for any refusal or failure. */
async function optional<T>(path: string): Promise<T | null> {
    try {
        const res = await apiFetch(path);
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

function mayChange(org: Organization | null): boolean {
    return org?.actions
        ? org.actions.includes("site:update")
        : org?.role === "OWNER" || org?.role === "ADMIN";
}

/** How many products "More…" holds; a shop with more finds them by search. */
const PRODUCTS_MAX = 500;

async function readTargets(
    base: string,
    site: SiteSummary,
    detail: SiteDetail | null,
    links: WebAddressLinks | null,
    displayOrigin: string | null,
): Promise<QrTargets> {
    const storefront = detail?.sellsFrom?.storefront?.id ?? null;
    const [products, publication] = await Promise.all([
        links?.links.shop && storefront
            ? optional<{ id: string; name: string; slug: string }[]>(
                  `${base}/products?${new URLSearchParams({
                      storefront,
                      status: "PUBLISHED",
                  })}`,
              )
            : null,
        site.currentPublicationId
            ? optional<{ snapshot?: { pages?: { path: string }[] } }>(
                  `${base}/sites/${site.id}/publications/${encodeURIComponent(site.currentPublicationId)}`,
              )
            : null,
    ]);
    const published = publication?.snapshot?.pages?.map((p) => p.path) ?? null;
    return buildQrTargets({
        origin: displayOrigin,
        links: links ? links.links : null,
        products: Array.isArray(products)
            ? products
                  .slice(0, PRODUCTS_MAX)
                  .map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
            : null,
        pages: publishedFreePages(detail?.pages ?? [], published),
    });
}

export async function readQrScreen(
    org: Organization | null,
): Promise<QrScreen> {
    const [sites, links] = await Promise.all([
        listSites(),
        readWebAddressLinks(),
    ]);
    const site = pickShareSite(sites, links?.address);
    const base = await orgBase();
    if (!site || !base) return { state: "no-site" };

    const view = await listQrCodes(site.id);
    if (!view) return { state: "no-site" };

    const canChange = mayChange(org);
    // The custom domain when the business's own site has one; a code's
    // short link stays on the Saroh address either way (DEC-069).
    const displayOrigin =
        links && links.address === site.subdomain ? links.origin : view.origin;

    const [detail, access, settings] = await Promise.all([
        optional<SiteDetail>(`${base}/sites/${site.id}`),
        billingAccessOrNull(),
        readOrganizationSettings().catch(() => null),
    ]);
    const lock = qrStyleLock(access, view.included);
    const logoUrl = settings?.ok ? (settings.data.logo?.url ?? null) : null;
    // The logo is only drawn in a branded code.
    const wantsLogo =
        !lock || view.codes.some((c) => c.style === "BRANDED" && !c.retired);
    const [targets, logo] = await Promise.all([
        canChange
            ? readTargets(base, site, detail, links, displayOrigin)
            : buildQrTargets({
                  origin: displayOrigin,
                  links: null,
                  products: null,
                  pages: [],
              }),
        wantsLogo ? logoDataUrl(logoUrl) : null,
    ]);

    const name = org?.name ?? site.name;
    return {
        state: "ready",
        site: { id: site.id, name: site.name },
        view,
        canChange,
        targets,
        displayOrigin,
        swatches: qrSwatches(detail),
        lock,
        business: {
            name,
            initials: initialsOf(name),
            logo,
            hasLogo: logoUrl !== null,
        },
    };
}
