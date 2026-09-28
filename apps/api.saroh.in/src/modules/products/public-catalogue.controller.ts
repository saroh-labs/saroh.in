import { Controller, Get, Header, Headers, Ip, Param } from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import type { SiteRelay } from "../site-accounts/site-relay";
import {
    SITE_RELAY_HEADER,
    verifySiteRelay,
} from "../site-accounts/site-relay";
import { siteRelaySecret } from "../site-accounts/site-secrets";
import type {
    PublicCatalogue,
    PublicProduct,
} from "./public-catalogue.serialize";
import { PublicCatalogueService } from "./public-catalogue.service";

/**
 * The public shop's reads (round-2 G11), under
 * `/public/sites/:siteId/shop/products` with NO guards: anonymous visitors, and saroh.app's server rendering `/shop`,
 * call them. No session and no organization context — the service derives
 * the business from the site, and 404s unless the shop is open there
 * (`SITE_SHOP`, Commerce on, a storefront chosen).
 *
 * The limit counts the visitor. saroh.app relays the visitor's address in
 * the signed `x-saroh-relay` header (ADR-011), and a relay that checks is
 * used; anything else — no header, a forged or stale one — counts the
 * caller's own address (DEC-027), so forging the header buys nothing.
 * Read live, never cached: a product that sells out must stop saying
 * "In stock".
 *
 * Why `shop/products` and not `products`: this module registers before the
 * sites module, and `:siteId/products` would also match
 * `by-subdomain/products` — a site whose address is "products" would be
 * answered by the shop, not the publication read. Three segments collide
 * with none of `PublicSitesController`'s routes.
 */
@Controller("public/sites")
export class PublicCatalogueController {
    constructor(private readonly catalogue: PublicCatalogueService) {}

    @Get(":siteId/shop/products")
    @Header("Cache-Control", "no-store")
    list(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicCatalogue> {
        return this.catalogue.list(siteId, visitorKey(ip, relay));
    }

    @Get(":siteId/shop/products/:slug")
    @Header("Cache-Control", "no-store")
    product(
        @Param("siteId") siteId: string,
        @Param("slug") slug: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicProduct> {
        return this.catalogue.product(siteId, slug, visitorKey(ip, relay));
    }
}

/**
 * The address a limit counts, hashed: the relayed visitor's when the relay
 * checks, else the caller's own.
 */
export function visitorKey(
    ip: string | undefined,
    relay: string | undefined,
    secret: () => string = siteRelaySecret,
): string | undefined {
    if (relay) {
        const checked = relayOrNull(relay, secret);
        if (checked) return checked.clientHash;
    }
    return hashClientIp(ip);
}

function relayOrNull(relay: string, secret: () => string): SiteRelay | null {
    try {
        return verifySiteRelay(relay, secret());
    } catch {
        // No secret configured on this instance: count the caller instead.
        return null;
    }
}
