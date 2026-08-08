import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

/**
 * Liveness and readiness. `TerminusModule` was imported here and never used;
 * dropped rather than left as a dependency the module does not need.
 */
@Module({
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule {}
