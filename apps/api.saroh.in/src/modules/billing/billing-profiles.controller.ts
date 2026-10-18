import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import type { BillingProfileView } from "./billing-profiles.service";
import { BillingProfilesService } from "./billing-profiles.service";

/**
 * The signed-in person's own billing profiles (DEC-167), with no business
 * in the way: setting up a business asks who Saroh bills for it before the
 * business exists (R7), so this is session-scoped, like the address check.
 * Only the caller's own are listed (the service filters by owner); nobody
 * else's ever is. Profiles as a business uses them are its Plan & billing's.
 */
@Controller("billing-profiles")
@UseGuards(BetterAuthGuard)
export class BillingProfilesController {
    constructor(private readonly profiles: BillingProfilesService) {}

    @Get()
    listMine(@CurrentUser() user: AuthUser): Promise<BillingProfileView[]> {
        return this.profiles.listMine(user.id);
    }
}
