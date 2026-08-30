import { Module } from "@nestjs/common";

import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { StoresModule } from "../stores/stores.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
    imports: [StoresModule, CapabilitiesModule],
    controllers: [CustomersController],
    providers: [CustomersService],
    exports: [CustomersService],
})
export class CustomersModule {}
