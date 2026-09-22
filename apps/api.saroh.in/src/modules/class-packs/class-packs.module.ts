import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    BookingClassPackController,
    ClassPacksController,
} from "./class-packs.controller";
import { ClassPacksService } from "./class-packs.service";

/** Class packs: the packs, the people holding them, and spending them (ADR-007). */
@Module({
    imports: [
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
        InvoicesModule,
    ],
    controllers: [ClassPacksController, BookingClassPackController],
    providers: [ClassPacksService, OrganizationGuard],
    exports: [ClassPacksService],
})
export class ClassPacksModule {}
