import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";

/** Owner-managed API keys (plan 2026-11-10-001, U5); U6's guard uses the service. */
@Module({
    imports: [OrganizationContextModule, AuditModule],
    controllers: [ApiKeysController],
    providers: [ApiKeysService],
    exports: [ApiKeysService],
})
export class ApiKeysModule {}
