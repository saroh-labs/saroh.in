import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { objectStorageProvider } from "./object-storage.provider";

/**
 * Org-owned media uploads (S2-008). Imports {@link OrganizationsModule} for the
 * `OrganizationContextService` that `OrganizationGuard` needs, and wires the
 * {@link objectStorageProvider} (R2 in prod, in-memory in dev) that
 * {@link MediaService} depends on via the `OBJECT_STORAGE` token.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule)],
    controllers: [MediaController],
    providers: [MediaService, objectStorageProvider, OrganizationGuard],
    exports: [MediaService],
})
export class MediaModule {}
