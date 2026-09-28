import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { StockModule } from "../stock/stock.module";
import { HomeController } from "./home.controller";
import { HomeService } from "./home.service";

/**
 * Home module (#119). Depends on CapabilitiesModule for the module-availability
 * projection, OrganizationsModule for the OrganizationGuard's context service,
 * StockModule for the Stock screen's short checks (round 2, F1), and
 * SiteAccountsModule for the customers waiting on a reply (`ThreadsService`,
 * round 2, F2).
 */
@Module({
    imports: [
        CapabilitiesModule,
        OrganizationsModule,
        StockModule,
        SiteAccountsModule,
    ],
    controllers: [HomeController],
    providers: [HomeService, OrganizationGuard],
})
export class HomeModule {}
