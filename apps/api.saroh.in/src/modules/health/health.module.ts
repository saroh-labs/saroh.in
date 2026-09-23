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
    // Exported for the admin console's health board, which reads the same
    // readiness checks the load balancer does.
    exports: [HealthService],
})
export class HealthModule {}
