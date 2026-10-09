import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { domainHostingProvider } from "./domain-hosting.provider";
import { domainVerifierProvider } from "./domain-verifier";
import { DomainsController } from "./domains.controller";
import { DomainsService } from "./domains.service";

/**
 * Org-owned subdomain / custom-domain claims (S2-007). Imports
 * {@link OrganizationsModule} (via forwardRef) for the
 * `OrganizationContextService` that `OrganizationGuard` needs, and wires the
 * {@link domainVerifierProvider} (real DNS_TXT in prod) that
 * {@link DomainsService} depends on via the `DOMAIN_VERIFIER` token, and the
 * {@link domainHostingProvider} (Cloudflare for SaaS, or null when hosting
 * is off, #859) under `DOMAIN_HOSTING`.
 */
@Module({
    imports: [
        BillingModule,
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
    ],
    controllers: [DomainsController],
    providers: [
        DomainsService,
        domainVerifierProvider,
        domainHostingProvider,
        OrganizationGuard,
    ],
    exports: [DomainsService],
})
export class DomainsModule {}
