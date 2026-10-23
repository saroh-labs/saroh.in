import { Get, Query } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

import { IdentityOnly } from "../../common/decorators/identity-only.decorator";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminHomeService } from "./admin-home.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminSearchService } from "./admin-search.service";

/** The header search's term, as typed. Under two characters finds nothing. */
export class ConsoleSearchDto {
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim() : value,
    )
    @IsString()
    @MaxLength(200)
    q?: string;
}

/**
 * The console's own chrome (admin console redesign U10): Home's "Needs you"
 * and counts, and the header search.
 */
@AdminRoutes()
export class AdminConsoleController {
    constructor(
        private readonly homeService: AdminHomeService,
        private readonly searchService: AdminSearchService,
    ) {}

    /**
     * Counts and dates only, the way `/admin/metrics` is: each "Needs you"
     * kind only for staff whose permissions reach its fix.
     */
    @Get("home")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    home(@PlatformAdminContext() staff: PlatformAdminInfo) {
        return this.homeService.home(staff);
    }

    /**
     * Identity is enough to ask, because every part of the answer is gated
     * by its own permission inside the service (businesses through
     * `scopeForStaff`, users by `organization:pii:read`, Razorpay ids by
     * `saroh-billing:read`), and an Account manager, who holds no
     * `platform:read`, must still find the businesses they look after.
     */
    @Get("search")
    @IdentityOnly()
    consoleSearch(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ConsoleSearchDto,
    ) {
        return this.searchService.search(staff, query.q);
    }
}
