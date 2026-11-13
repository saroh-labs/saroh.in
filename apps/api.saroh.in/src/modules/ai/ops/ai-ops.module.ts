import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../../env";
import { BillingModule } from "../../billing/billing.module";
import { JobHandlerRegistry } from "../../jobs/job-handler.registry";
import { JobsModule } from "../../jobs/jobs.module";
import { AiModule } from "../ai.module";
import { AskAiReportsController } from "../reports/ai-reports.controller";
import { AiReportsService } from "../reports/ai-reports.service";
import { AiOpsAdminService } from "./ai-ops-admin.service";
import { AI_FAILURE_ALARM_TYPE, FailureAlarmJob } from "./failure-alarm.job";
import { AI_GRANT_END_TYPE, AiGrantEndJob } from "./grant-end.job";
import { OwnerAlertSender } from "./owner-alert";
import { AI_SPEND_ALARM_TYPE, SpendAlarmJob } from "./spend-alarm.job";

/** How often a stopped alarm chain is looked for and restarted. */
const CHAIN_CHECK_MS = 60 * 60_000;

/**
 * Saroh's watch over Ask AI (DEC-220, plan 2026-11-13-001 U8): the spend
 * alarm and its halt, the failure watch, owners' alert emails, Report this
 * answer, the end of a granted Request more, and what the console's Ask AI
 * page reads and writes (`AdminAskAiController`, registered by the admin
 * module behind its guards).
 */
@Module({
    imports: [JobsModule, BillingModule, AiModule],
    controllers: [AskAiReportsController],
    providers: [
        OwnerAlertSender,
        SpendAlarmJob,
        FailureAlarmJob,
        AiGrantEndJob,
        AiReportsService,
        AiOpsAdminService,
    ],
    exports: [AiOpsAdminService, AiReportsService],
})
export class AiOpsModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly spend: SpendAlarmJob,
        private readonly failures: FailureAlarmJob,
        private readonly grantEnd: AiGrantEndJob,
    ) {}

    async onModuleInit(): Promise<void> {
        this.registry.register(AI_SPEND_ALARM_TYPE, this.spend.handle);
        this.registry.register(AI_FAILURE_ALARM_TYPE, this.failures.handle);
        this.registry.register(AI_GRANT_END_TYPE, this.grantEnd.handle);
        if (env.NODE_ENV === "test") return;
        const ensure = async () => {
            await this.spend.chain.ensureScheduled();
            await this.failures.chain.ensureScheduled();
        };
        await ensure();
        this.chainCheck = setInterval(() => void ensure(), CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
