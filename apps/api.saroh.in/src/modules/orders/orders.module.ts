import { Module } from "@nestjs/common";

import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { StoresModule } from "../stores/stores.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
    imports: [StoresModule, CapabilitiesModule],
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
export class OrdersModule {}
