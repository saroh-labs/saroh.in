import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { ASK_AI_AGENT } from "./agents/ask-ai.agent";
import { ConversationsService } from "./conversations.service";
import { AI_RETENTION_TYPE, AiRetentionJob } from "./history/retention.job";
import { AiSdkAdapter } from "./providers/ai-sdk.adapter";
import { AI_PROVIDER } from "./providers/provider.port";
import { AiSettingsService } from "./settings/ai-settings.service";
import { AI_TOOLBOX, NO_TOOLS } from "./tools/toolbox.port";
import { TurnRegistry } from "./turn/turn-registry";
import { AI_AGENTS, TurnRunner } from "./turn/turn-runner";
import { TurnStore } from "./turn/turn-store";
import { STUCK_TURN_CHECK_MS, StuckTurnSweep } from "./usage/stuck-turns";

/** How often a stopped retention chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Saroh's AI layer (DEC-220, plan 2026-11-13-001). U3: the provider behind
 * its port, the AI settings store, a person's own conversations, and the
 * 90-day retention sweep. U13: the agents, the turn runner with its guards,
 * Stop's registry and the stuck-turn sweep. Tools (U4, `NO_TOOLS` until
 * then), drafts (U5) and routes (U9) are added here as they land.
 */
@Module({
    imports: [JobsModule, FeatureFlagModule],
    providers: [
        { provide: AI_PROVIDER, useFactory: () => new AiSdkAdapter() },
        { provide: AI_TOOLBOX, useValue: NO_TOOLS },
        { provide: AI_AGENTS, useValue: [ASK_AI_AGENT] },
        AiSettingsService,
        ConversationsService,
        AiRetentionJob,
        TurnStore,
        TurnRunner,
        TurnRegistry,
        StuckTurnSweep,
    ],
    exports: [
        AI_PROVIDER,
        AiSettingsService,
        ConversationsService,
        TurnRunner,
        TurnRegistry,
    ],
})
export class AiModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;
    private stuckCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly retention: AiRetentionJob,
        private readonly stuck: StuckTurnSweep,
    ) {}

    async onModuleInit(): Promise<void> {
        this.registry.register(AI_RETENTION_TYPE, this.retention.handle);
        if (env.NODE_ENV === "test") return;
        await this.retention.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.retention.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
        // Every replica sweeps; the update is conditional, so a row fails once.
        this.stuckCheck = setInterval(() => {
            void this.stuck.sweep();
        }, STUCK_TURN_CHECK_MS);
        this.stuckCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
        clearInterval(this.stuckCheck);
    }
}
