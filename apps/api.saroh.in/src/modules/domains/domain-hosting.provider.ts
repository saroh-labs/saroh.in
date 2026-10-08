import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";

import { env } from "../../env";
import type { DomainHosting } from "./domain-hosting";
import { DOMAIN_HOSTING, hostingConfig } from "./domain-hosting";
import { CloudflareDomainHosting } from "./providers/cloudflare-hosting";

const logger = new Logger("DomainHosting");

/**
 * The adapter for this instance, or null when hosting isn't set up. Off is a
 * degraded path, not an error: domains still verify, the read says hosting
 * isn't set up, and this WARN at boot says so. One line per boot; on a
 * deployed API it means verified custom domains don't serve.
 */
export function createDomainHosting(): DomainHosting | null {
    const config = hostingConfig();
    if (!config) {
        const missing = [
            env.CLOUDFLARE_HOSTNAMES_TOKEN
                ? null
                : "CLOUDFLARE_HOSTNAMES_TOKEN",
            env.CLOUDFLARE_HOSTNAMES_ZONE_ID
                ? null
                : "CLOUDFLARE_HOSTNAMES_ZONE_ID",
        ].filter(Boolean);
        logger.warn(
            `domain_hosting_off missing=${missing.join(",")}: verified custom domains are not registered with Cloudflare and won't serve`,
        );
        return null;
    }
    return new CloudflareDomainHosting(config);
}

/** Nest provider exposing the port (or null, off) under {@link DOMAIN_HOSTING}. */
export const domainHostingProvider: Provider = {
    provide: DOMAIN_HOSTING,
    useFactory: createDomainHosting,
};
