import { Module } from "@nestjs/common";

import { MediaService } from "./media.service";
import {
    OBJECT_STORAGE,
    objectStorageProvider,
} from "./object-storage.provider";

/**
 * The media library's service and its storage, without the controller —
 * so a module that only reads stored bytes (the invoice PDF's logo,
 * DEC-083) can have them without the controller's organization and Better
 * Auth guards. {@link MediaModule} imports and re-exports it, so the app
 * holds one storage and one service.
 */
@Module({
    providers: [MediaService, objectStorageProvider],
    // The storage port too: a data export writes its zip through it (DEC-120).
    exports: [MediaService, OBJECT_STORAGE],
})
export class MediaStorageModule {}
