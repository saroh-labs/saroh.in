import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsModule } from "../payments/payments.module";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { AccountPacksController } from "./account-packs.controller";
import {
    BookingClassPackController,
    ClassPacksController,
} from "./class-packs.controller";
import { ClassPacksService } from "./class-packs.service";
import {
    PACK_EXPIRING_TYPE,
    PackExpiringHandler,
} from "./pack-expiring.handler";
import { PublicPackPurchaseService } from "./public-pack-purchase.service";
import { PublicPacksController } from "./public-packs.controller";
import { PublicPacksService } from "./public-packs.service";

/** How often a stopped expiry sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/** Class packs: the packs, the people holding them, and spending them (ADR-007). */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        InvoicesModule,
        JobsModule,
        // A customer buying a pack online (A11): the invoice payment path,
        // and the account area's switch and session guards.
        PaymentsModule,
        SiteAccountsModule,
    ],
    controllers: [
        ClassPacksController,
        BookingClassPackController,
        AccountPacksController,
        // G20: the Prices page's Class packs section.
        PublicPacksController,
    ],
    providers: [
        ClassPacksService,
        OrganizationGuard,
        PublicPackPurchaseService,
        PublicPacksService,
        PackExpiringHandler,
    ],
    exports: [ClassPacksService],
})
export class ClassPacksModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly expiring: PackExpiringHandler,
    ) {}

    /**
     * The expiry sweep (DEC-174 U22) registers here and keeps its chain
     * going; never started under test (no worker runs).
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(PACK_EXPIRING_TYPE, this.expiring.handle);
        if (env.NODE_ENV === "test") return;
        await this.expiring.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.expiring.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
