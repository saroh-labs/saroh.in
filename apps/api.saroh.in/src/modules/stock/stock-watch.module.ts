import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { BackInStockHandler } from "./back-in-stock.handler";
import { BACK_IN_STOCK_TYPE } from "./stock-watch-rules";
import { StockWatchController } from "./stock-watch.controller";
import { StockWatchService } from "./stock-watch.service";
import { StockWatchesController } from "./stock-watches.controller";

/**
 * "Tell me when it's back" (DEC-174 U23, #1154): the public "Tell me" and
 * its stop page on a business's site, the workspace's count of who waits,
 * and the `stock.back-in-stock` run that tells them. The stock writers
 * reach it through one plain function (`on-sellable-again.ts`), so the
 * stock module needs no wiring to it.
 */
@Module({
    imports: [
        JobsModule,
        CapabilitiesModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [StockWatchController, StockWatchesController],
    providers: [StockWatchService, BackInStockHandler, OrganizationGuard],
})
export class StockWatchModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly backInStock: BackInStockHandler,
    ) {}

    onModuleInit(): void {
        this.registry.register(BACK_IN_STOCK_TYPE, this.backInStock.handle);
    }
}
