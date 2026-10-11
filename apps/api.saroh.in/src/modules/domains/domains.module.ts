import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Logger, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { domainHostingProvider } from "./domain-hosting.provider";
import {
    DOMAIN_RECHECK_TYPE,
    DomainRecheckHandler,
} from "./domain-recheck.handler";
import { domainVerifierProvider } from "./domain-verifier";
import { DomainsController } from "./domains.controller";
import { DomainsService } from "./domains.service";

/** How often a lost re-check chain is noticed and started again. */
const CHAIN_CHECK_MS = 60 * 60 * 1000;

/**
 * Org-owned subdomain / custom-domain claims (S2-007). Imports
 * {@link OrganizationsModule} (via forwardRef) for the
 * `OrganizationContextService` that `OrganizationGuard` needs, and wires the
 * {@link domainVerifierProvider} (real DNS_TXT in prod) that
 * {@link DomainsService} depends on via the `DOMAIN_VERIFIER` token, and the
 * {@link domainHostingProvider} (Cloudflare for SaaS, or null when hosting
 * is off, #859) under `DOMAIN_HOSTING`.
 *
 * Runs the background re-check (#860): the `domains.recheck` chain, every
 * five minutes, started at boot and restarted by a timer if it ever runs
 * out (the renewal job's shape, ADR-007). Not under test, and not where
 * hosting is off.
 */
@Module({
    imports: [
        BillingModule,
        JobsModule,
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
    ],
    controllers: [DomainsController],
    providers: [
        DomainsService,
        DomainRecheckHandler,
        domainVerifierProvider,
        domainHostingProvider,
        OrganizationGuard,
    ],
    exports: [DomainsService],
})
export class DomainsModule implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DomainsModule.name);
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly recheck: DomainRecheckHandler,
    ) {}

    /** Never throws: a database not up yet cannot stop the boot. */
    async onModuleInit(): Promise<void> {
        this.registry.register(DOMAIN_RECHECK_TYPE, this.recheck.handle);
        if (env.NODE_ENV === "test") return;
        if (!this.recheck.enabled()) {
            this.logger.log(
                "domains_recheck_off: custom domains are re-checked only on Check now here",
            );
            return;
        }
        await this.recheck.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.recheck.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
