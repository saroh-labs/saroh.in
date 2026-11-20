import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { MediaStorageModule } from "./media-storage.module";
import { MediaController } from "./media.controller";
import {
    PENDING_UPLOAD_SWEEP_TYPE,
    PendingUploadSweepJob,
} from "./pending-upload-sweep.job";

/** How often a stopped pending-upload sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Org-owned media uploads (S2-008). Imports {@link OrganizationContextModule}
 * for the `OrganizationContextService` that `OrganizationGuard` needs — not
 * the whole `OrganizationsModule`, which imports this one for the business
 * logo — and {@link MediaStorageModule}: `MediaService` and the
 * `objectStorageProvider` (R2 in prod, in-memory in dev) it depends on via
 * the `OBJECT_STORAGE` token, re-exported. Runs the sweep of uploads never
 * confirmed (M-5, `media.pending-sweep`).
 */
@Module({
    imports: [OrganizationContextModule, MediaStorageModule, JobsModule],
    controllers: [MediaController],
    providers: [PendingUploadSweepJob],
    exports: [MediaStorageModule],
})
export class MediaModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sweep: PendingUploadSweepJob,
    ) {}

    /** The sweep registers here; never started under test. */
    async onModuleInit(): Promise<void> {
        this.registry.register(PENDING_UPLOAD_SWEEP_TYPE, this.sweep.handle);
        if (env.NODE_ENV === "test") return;
        await this.sweep.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.sweep.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
