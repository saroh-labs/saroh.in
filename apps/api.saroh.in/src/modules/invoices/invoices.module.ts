import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { ACCOUNT_THREAD_POSTER } from "../communications/account-thread";
import { CommunicationsModule } from "../communications/communications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AccountThreadPosterService } from "../site-accounts/thread-poster";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

/**
 * Invoices a business issues (ADR-007). Exports the service so
 * subscriptions, courses and class packs can issue on their own transaction.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        CommunicationsModule,
    ],
    controllers: [InvoicesController],
    providers: [
        InvoicesService,
        InvoiceSendService,
        OrganizationGuard,
        // The account thread's poster (A13). Still offered only while the
        // ACCOUNT_THREAD flag is on, which it is not by default.
        {
            provide: ACCOUNT_THREAD_POSTER,
            useClass: AccountThreadPosterService,
        },
    ],
    exports: [InvoicesService],
})
export class InvoicesModule {}
