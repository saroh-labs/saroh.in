import { Module } from "@nestjs/common";
import Redis from "ioredis";

import { env } from "../../env";
import { BillingModule } from "../billing/billing.module";
import { CapsService } from "./caps";
import { LimitsService } from "./limits.service";

/** A client that fails fast, so a Redis outage costs a call ~nothing. */
function connect(url: string | undefined): Redis | null {
    if (!url) return null;
    const redis = new Redis(url, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 250,
    });
    // Every failing call already logs `rate_limit_open`; without a listener
    // ioredis prints each reconnect error itself.
    redis.on("error", () => undefined);
    return redis;
}

@Module({
    imports: [BillingModule],
    providers: [
        CapsService,
        {
            provide: LimitsService,
            // Number(...) || 1: under SKIP_ENV_VALIDATION the schema default is gone.
            useFactory: () =>
                new LimitsService(
                    connect(env.REDIS_URL),
                    Number(env.API_REPLICAS) || 1,
                ),
        },
    ],
    exports: [CapsService, LimitsService],
})
export class LimitsModule {}
