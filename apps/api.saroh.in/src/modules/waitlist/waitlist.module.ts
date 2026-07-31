import { Module } from "@nestjs/common";

import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";

/**
 * PUBLIC waitlist capture. Intentionally guardless and org-agnostic: a signup
 * happens before any Organization or User exists, so there is nothing to scope
 * to and no session to check.
 */
@Module({
    controllers: [WaitlistController],
    providers: [WaitlistService],
    exports: [WaitlistService],
})
export class WaitlistModule {}
