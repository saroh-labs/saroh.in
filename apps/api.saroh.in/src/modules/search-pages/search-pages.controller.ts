import { Body, Get, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminDeploymentsService } from "../admin/admin-deployments.service";
import { AdminPermission } from "../admin/admin-permissions";
import { AdminRoutes } from "../admin/admin-routes.decorator";
import { SearchPageActionDto, SearchPageHistoryQueryDto } from "./dto";
import { SearchPagesService } from "./search-pages.service";

/**
 * Search pages in the console (DEC-193), under `/admin/search-pages`.
 * Registered by the admin module, so the console's guard stack and its
 * permission contract cover every route. Anyone who can read the console
 * sees the list and the history; only `search-pages:publish` acts. No
 * support session: a search page belongs to no business.
 */
@AdminRoutes()
export class SearchPagesController {
    constructor(
        private readonly pages: SearchPagesService,
        private readonly deployments: AdminDeploymentsService,
    ) {}

    @Get("search-pages")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    async list() {
        // The console's own Deployments read (cached): the web app's newest run here.
        const { rows } = await this.deployments.list();
        const web = rows.find((r) => r.app === "web")?.latestRun ?? null;
        return this.pages.list(web);
    }

    @Get("search-pages/history")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    history(@Query() query: SearchPageHistoryQueryDto) {
        return this.pages.history(query.path);
    }

    @Post("search-pages/actions")
    @RequireAdminPermission(AdminPermission.SearchPagesPublish)
    act(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: SearchPageActionDto,
    ) {
        return this.pages.act(staff, dto.action, dto.paths);
    }
}
