import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BillingModule } from "../billing/billing.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { domainVerifierProvider } from "./domain-verifier";
import { DomainsController } from "./domains.controller";
import { DomainsService } from "./domains.service";

/**
 * Org-owned subdomain / custom-domain claims (S2-007). Imports
 * {@link OrganizationsModule} (via forwardRef) for the
 * `OrganizationContextService` that `OrganizationGuard` needs, and wires the
 * {@link domainVerifierProvider} (real DNS_TXT in prod) that
 * {@link DomainsService} depends on via the `DOMAIN_VERIFIER` token.
 */
@Module({
    imports: [BillingModule, forwardRef(() => OrganizationsModule)],
    controllers: [DomainsController],
    providers: [DomainsService, domainVerifierProvider, OrganizationGuard],
    exports: [DomainsService],
})
export class DomainsModule {}
