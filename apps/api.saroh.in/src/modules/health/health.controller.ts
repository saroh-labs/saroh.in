import { Controller, Get, HttpCode, Res } from "@nestjs/common";
import type { Response } from "express";

import { env } from "../../env";
import type { ReadinessReport } from "./health.service";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
    constructor(private readonly health: HealthService) {}

    /**
     * Kept at the original path and shape so existing probes and uptime checks
     * do not break. This is a LIVENESS answer — `/health/ready` is the one that
     * says whether this instance can actually serve.
     */
    @Get()
    check() {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
            environment: env.NODE_ENV,
            version: env.npm_package_version ?? "0.1.0",
        };
    }

    /** Process liveness. Touches no dependency, so it cannot fail on theirs. */
    @Get("live")
    live() {
        return this.health.liveness();
    }

    /**
     * Readiness. Returns 503 when a dependency is down, because an orchestrator
     * reads the STATUS CODE — a 200 carrying `{"status":"not_ready"}` would keep
     * a broken instance in rotation, which is the exact failure this endpoint
     * exists to prevent.
     */
    @Get("ready")
    @HttpCode(200)
    async ready(@Res({ passthrough: true }) res: Response) {
        const report: ReadinessReport = await this.health.readiness();
        if (report.status !== "ready") res.status(503);
        return report;
    }
}
