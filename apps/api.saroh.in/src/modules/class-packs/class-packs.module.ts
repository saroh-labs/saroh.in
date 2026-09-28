import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsModule } from "../payments/payments.module";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { AccountPacksController } from "./account-packs.controller";
import {
    BookingClassPackController,
    ClassPacksController,
} from "./class-packs.controller";
import { ClassPacksService } from "./class-packs.service";
import { PublicPackPurchaseService } from "./public-pack-purchase.service";
import { PublicPacksController } from "./public-packs.controller";
import { PublicPacksService } from "./public-packs.service";

/** Class packs: the packs, the people holding them, and spending them (ADR-007). */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        InvoicesModule,
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
    ],
    exports: [ClassPacksService],
})
export class ClassPacksModule {}
