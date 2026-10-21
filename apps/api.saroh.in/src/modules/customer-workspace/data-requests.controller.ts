import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    CloseDataRequestDto,
    ListDataRequestsQueryDto,
} from "./data-requests.dto";
import type { DataRequestRow } from "./data-requests.service";
import { DataRequestsService } from "./data-requests.service";

/**
 * Customers' "Ask to remove my data" requests (DEC-172, #1106), for whoever
 * can run a customer removal (`customer:remove`, asked in the service).
 * Done is recorded by the removal itself
 * (`POST customers/:contactId/removal`); here a request is listed or
 * closed without removal, with a reason.
 */
@Controller("organizations/:organizationId/customer-requests")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class DataRequestsController {
    constructor(private readonly requests: DataRequestsService) {}

    /** `?status=open|done|closed|all`, open when left out; newest first. */
    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListDataRequestsQueryDto,
    ): Promise<{ requests: DataRequestRow[] }> {
        return this.requests.list(ctx, query.status);
    }

    /** Close one without removal; the reason is required. */
    @Post(":requestId/close")
    @HttpCode(200)
    close(
        @OrgContext() ctx: OrganizationContext,
        @Param("requestId") requestId: string,
        @Body() dto: CloseDataRequestDto,
    ): Promise<DataRequestRow> {
        return this.requests.close(ctx, requestId, dto.reason);
    }
}
