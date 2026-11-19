import { Module } from "@nestjs/common";
import { env } from "../../env";
import { BillingModule } from "../billing/billing.module";
import { CapsService } from "./caps";
import { LimitsService } from "./limits.service";
import { sharedRedis } from "./redis-client";

@Module({
    imports: [BillingModule],
    providers: [
        CapsService,
        {
            provide: LimitsService,
            // Number(...) || 1: under SKIP_ENV_VALIDATION the schema default is gone.
            useFactory: () =>
                new LimitsService(sharedRedis(), Number(env.API_REPLICAS) || 1),
        },
    ],
    exports: [CapsService, LimitsService],
})
export class LimitsModule {}
