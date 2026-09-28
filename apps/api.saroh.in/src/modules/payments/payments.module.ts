import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { providerFactoryProvider } from "./providers/provider.factory";
import { PublicInvoicesController } from "./public-invoices.controller";
import { PublicInvoicesService } from "./public-invoices.service";
import { PublicOrderPayController } from "./public-order-pay.controller";
import { PublicOrderPayService } from "./public-order-pay.service";
import { PublicPaymentsController } from "./public-payments.controller";
import { SEND_REFUND_TYPE, SendRefundHandler } from "./send-refund.handler";

/**
 * Org merchant-payments module (S5-002). Imports {@link OrganizationsModule}
 * (via forwardRef) for the `OrganizationContextService` that `OrganizationGuard`
 * needs, and wires the {@link providerFactoryProvider} (real Razorpay/Cashfree
 * adapters in prod) that {@link PaymentsService} depends on via the
 * `PROVIDER_FACTORY` token.
 */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        // Sending a refused checkout's refund (G13, DEC-032).
        JobsModule,
    ],
    controllers: [
        PaymentsController,
        PublicPaymentsController,
        PublicInvoicesController,
        PublicOrderPayController,
    ],
    providers: [
        PaymentsService,
        PublicInvoicesService,
        PublicOrderPayService,
        providerFactoryProvider,
        OrganizationGuard,
        SendRefundHandler,
    ],
    exports: [PaymentsService],
})
export class PaymentsModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sendRefund: SendRefundHandler,
    ) {}

    /** The job a refused site checkout's refund is sent from (G13). */
    onModuleInit(): void {
        this.registry.register(SEND_REFUND_TYPE, this.sendRefund.handle);
    }
}
