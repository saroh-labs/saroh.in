import { Controller, Get } from "@nestjs/common";

import { env } from "../../env";

@Controller("health")
export class HealthController {
    @Get()
    check() {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
            environment: env.NODE_ENV,
            version: env.npm_package_version ?? "0.1.0",
        };
    }
}
