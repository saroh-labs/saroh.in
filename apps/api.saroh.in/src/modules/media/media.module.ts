import { Module } from "@nestjs/common";

import { OrganizationContextModule } from "../organizations/organization-context.module";
import { MediaStorageModule } from "./media-storage.module";
import { MediaController } from "./media.controller";

/**
 * Org-owned media uploads (S2-008). Imports {@link OrganizationContextModule}
 * for the `OrganizationContextService` that `OrganizationGuard` needs — not
 * the whole `OrganizationsModule`, which imports this one for the business
 * logo — and {@link MediaStorageModule}: `MediaService` and the
 * `objectStorageProvider` (R2 in prod, in-memory in dev) it depends on via
 * the `OBJECT_STORAGE` token, re-exported.
 */
@Module({
    imports: [OrganizationContextModule, MediaStorageModule],
    controllers: [MediaController],
    exports: [MediaStorageModule],
})
export class MediaModule {}
