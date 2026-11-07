import {
    Body,
    Controller,
    Headers,
    HttpCode,
    Post,
    UseGuards,
} from "@nestjs/common";
import { editionOfHost } from "@saroh/edition";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { SelfTestEmailDto } from "./dto";
import { SelfTestService } from "./self-test.service";
import type { SelfTestTemplate } from "./self-test.templates";

/**
 * Self-test / template-preview emails (S6-004).
 *
 * Account-level, NOT org-scoped: guarded ONLY by {@link BetterAuthGuard}. The
 * handler receives the authenticated session user via {@link CurrentUser} and
 * passes it to the service, which hard-binds the recipient to `user.email`.
 * The request body carries only a `template` selector — there is no recipient
 * field, so a caller can never target an arbitrary address or masquerade as an
 * Organization's production delivery.
 */
@Controller("self-test")
@UseGuards(BetterAuthGuard)
export class SelfTestController {
    constructor(private readonly selfTest: SelfTestService) {}

    @Post("email")
    @HttpCode(200)
    sendEmail(
        @CurrentUser() user: AuthUser,
        @Body() dto: SelfTestEmailDto,
        @Headers("host") host?: string,
    ) {
        // `dto.template` is validated by the DTO to be one of the fixed keys.
        return this.selfTest.sendSelfTest(
            user,
            dto.template as SelfTestTemplate,
            // Sent from the edition it was asked through (KTD6).
            editionOfHost(host ?? "") ?? "INDIA",
        );
    }
}
