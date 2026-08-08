import { Module } from "@nestjs/common";

import { SelfTestController } from "./self-test.controller";
import { SelfTestService } from "./self-test.service";

/**
 * Self-test / template-preview emails (S6-004).
 *
 * A small account-level module (no org guard): an authenticated user previews a
 * built-in email template by sending a `[Saroh test]` message to their OWN
 * verified account address, rate-limited per user. See {@link SelfTestService}.
 */
@Module({
    controllers: [SelfTestController],
    providers: [SelfTestService],
})
export class SelfTestModule {}
