import { Module } from "@nestjs/common";

import { OrganizationContextModule } from "../organizations/organization-context.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { objectStorageProvider } from "./object-storage.provider";

/**
 * Org-owned media uploads (S2-008). Imports {@link OrganizationContextModule}
 * for the `OrganizationContextService` that `OrganizationGuard` needs — not
 * the whole `OrganizationsModule`, which imports this one for the business
 * logo — and wires the {@link objectStorageProvider} (R2 in prod, in-memory
 * in dev) that {@link MediaService} depends on via the `OBJECT_STORAGE` token.
 */
@Module({
    imports: [OrganizationContextModule],
    controllers: [MediaController],
    providers: [MediaService, objectStorageProvider],
    exports: [MediaService],
})
export class MediaModule {}
