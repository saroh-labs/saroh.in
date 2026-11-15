import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { BookingsModule } from "../bookings/bookings.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { ProductsModule } from "../products/products.module";
import { SitesModule } from "../sites/sites.module";
import { PublicShareController } from "./public-share.controller";
import { PublicShareService } from "./public-share.service";
import { ShareCardsController } from "./share-cards.controller";
import { SharePostsController } from "./share-posts.controller";
import { SharePostsService } from "./share-posts.service";

/**
 * Share pictures and a business's own posts (#1375, #1378; plan
 * 2026-11-12-003): the card renderer (`cards/`), its public image routes,
 * and Create post's saved posts.
 */
@Module({
    imports: [
        OrganizationContextModule,
        CapabilitiesModule,
        MediaStorageModule,
        SitesModule,
        ProductsModule,
        BookingsModule,
    ],
    controllers: [
        SharePostsController,
        ShareCardsController,
        PublicShareController,
    ],
    providers: [SharePostsService, PublicShareService, OrganizationGuard],
})
export class SharePostsModule {}
