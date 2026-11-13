import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { ConversationsService } from "./conversations.service";
import { AI_RETENTION_TYPE, AiRetentionJob } from "./history/retention.job";
import { AiSdkAdapter } from "./providers/ai-sdk.adapter";
import { AI_PROVIDER } from "./providers/provider.port";
import { AiSettingsService } from "./settings/ai-settings.service";

/** How often a stopped retention chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Saroh's AI layer (DEC-220, plan 2026-11-13-001). U3: the provider behind
 * its port, the AI settings store, a person's own conversations, and the
 * 90-day retention sweep. The agent, turn runner and guards (U13), tools
 * (U4), drafts (U5) and routes (U9) are added here as they land.
 */
@Module({
    imports: [JobsModule],
    providers: [
        { provide: AI_PROVIDER, useFactory: () => new AiSdkAdapter() },
        AiSettingsService,
        ConversationsService,
        AiRetentionJob,
    ],
    exports: [AI_PROVIDER, AiSettingsService, ConversationsService],
})
export class AiModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly retention: AiRetentionJob,
    ) {}

    async onModuleInit(): Promise<void> {
        this.registry.register(AI_RETENTION_TYPE, this.retention.handle);
        if (env.NODE_ENV === "test") return;
        await this.retention.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.retention.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
