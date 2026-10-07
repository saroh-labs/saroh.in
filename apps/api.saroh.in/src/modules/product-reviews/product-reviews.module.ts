import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AuditModule } from "../audit/audit.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { CommunicationsModule } from "../communications/communications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProductReviewsController } from "./product-reviews.controller";
import { ProductReviewsService } from "./product-reviews.service";
import { PublicProductReviewsController } from "./public-product-reviews.controller";
import { PublicProductReviewsService } from "./public-product-reviews.service";

/** Product reviews, by invitation (plan 2026-09-21-001). */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        AuditModule,
        // Invitations go through the business's own email provider (D11).
        CommunicationsModule,
    ],
    controllers: [ProductReviewsController, PublicProductReviewsController],
    providers: [
        ProductReviewsService,
        PublicProductReviewsService,
        OrganizationGuard,
    ],
})
export class ProductReviewsModule {}
