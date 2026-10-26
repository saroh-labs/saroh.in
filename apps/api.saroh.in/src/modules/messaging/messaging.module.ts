import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { otpTransportProvider } from "./providers/otp-transport.factory";
import { VerificationService } from "./verification.service";
import { WALLET_SWEEP_TYPE, WalletSweepHandler } from "./wallet-sweep.handler";
import { WalletService } from "./wallet.service";

/** How often a stopped wallet sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/** Saroh-sent verification codes and the prepaid balance that pays for them (DEC-191). */
@Module({
    imports: [JobsModule],
    providers: [
        otpTransportProvider,
        VerificationService,
        WalletService,
        WalletSweepHandler,
    ],
    exports: [VerificationService, WalletService],
})
export class MessagingModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly sweep: WalletSweepHandler,
    ) {}

    /** The wallet sweep (#1240) registers here; never started under test. */
    async onModuleInit(): Promise<void> {
        this.registry.register(WALLET_SWEEP_TYPE, this.sweep.handle);
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
