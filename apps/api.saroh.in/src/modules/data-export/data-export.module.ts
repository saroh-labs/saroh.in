import type { OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import {
    DATA_EXPORT_BUILD_TYPE,
    DATA_EXPORT_EXPIRE_TYPE,
} from "./data-export-types";
import { DataExportController } from "./data-export.controller";
import { DataExportHandler } from "./data-export.handler";
import { DataExportService } from "./data-export.service";

/**
 * "Download your data" (DEC-120): the owner's route, and the two jobs that
 * build a business's zip and delete it 7 days later. Storage is the media
 * library's port (`MediaStorageModule`), so the app holds one.
 */
@Module({
    imports: [
        OrganizationContextModule,
        AuditModule,
        JobsModule,
        MediaStorageModule,
    ],
    controllers: [DataExportController],
    providers: [DataExportService, DataExportHandler],
})
export class DataExportModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: DataExportHandler,
    ) {}

    onModuleInit(): void {
        this.registry.register(DATA_EXPORT_BUILD_TYPE, this.handler.build);
        this.registry.register(DATA_EXPORT_EXPIRE_TYPE, this.handler.expire);
    }
}
