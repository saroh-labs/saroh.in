import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";

import { env } from "../../env";
import { domainFakesOn } from "./domain-fakes";
import type { DomainHosting } from "./domain-hosting";
import { DOMAIN_HOSTING, hostingConfig } from "./domain-hosting";
import { CloudflareDomainHosting } from "./providers/cloudflare-hosting";
import { FakeDomainHosting } from "./providers/fake-hosting";

const logger = new Logger("DomainHosting");

/**
 * The adapter for this instance, or null when hosting isn't set up. The
 * test-only `DOMAIN_HOSTING_FAKE` wins over everything: the labelled fake
 * (`domain-fakes.ts`), for the browser-test stack. Off is a
 * degraded path, not an error: domains still verify, the read says hosting
 * isn't set up, and this WARN at boot says so. One line per boot; on a
 * deployed API it means verified custom domains don't serve.
 */
export function createDomainHosting(): DomainHosting | null {
    if (domainFakesOn()) {
        logger.warn(
            "domain_hosting_fake: custom domains are registered with an in-memory fake, never Cloudflare (DOMAIN_HOSTING_FAKE, test only)",
        );
        return new FakeDomainHosting({ byLabel: true });
    }
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

/**
 * Whether this instance hosts custom domains: true exactly when
 * {@link createDomainHosting} returns an adapter. For reads outside the
 * domains module (the admin business page) that need `hostingView`'s
 * `hostingOn` without building, or logging about, an adapter.
 */
export function domainHostingOn(): boolean {
    return domainFakesOn() || hostingConfig() !== null;
}

/** Nest provider exposing the port (or null, off) under {@link DOMAIN_HOSTING}. */
export const domainHostingProvider: Provider = {
    provide: DOMAIN_HOSTING,
    useFactory: createDomainHosting,
};
