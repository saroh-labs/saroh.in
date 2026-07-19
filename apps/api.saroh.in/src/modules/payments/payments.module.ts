import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { providerFactoryProvider } from "./providers/provider.factory";

/**
 * Org merchant-payments module (S5-002). Imports {@link OrganizationsModule}
 * (via forwardRef) for the `OrganizationContextService` that `OrganizationGuard`
 * needs, and wires the {@link providerFactoryProvider} (real Razorpay/Cashfree
 * adapters in prod) that {@link PaymentsService} depends on via the
 * `PROVIDER_FACTORY` token.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [PaymentsController],
    providers: [PaymentsService, providerFactoryProvider, OrganizationGuard],
    exports: [PaymentsService],
})
export class PaymentsModule {}
