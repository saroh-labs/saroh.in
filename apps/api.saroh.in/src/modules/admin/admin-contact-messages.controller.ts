import { Body, Get, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";

import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminContactMessagesService } from "./admin-contact-messages.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { ListContactMessagesDto, MarkContactMessageDto } from "./dto";

/**
 * Messages from saroh.in/contact (DEC-137; the public side is
 * `POST /public/contact-messages`). A message is a person's name, email and
 * words, so reading the list needs `organization:pii:read`. The team
 * replies from its own mailbox; marking a message handled (or open again)
 * also needs `reports:resolve`, Support's "close what people send in".
 */
@AdminRoutes()
export class AdminContactMessagesController {
    constructor(private readonly messages: AdminContactMessagesService) {}

    @Get("contact-messages")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    listContactMessages(@Query() query: ListContactMessagesDto) {
        return this.messages.list(query);
    }

    @Post("contact-messages/:id/handled")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.ReportsResolve,
    )
    markContactMessage(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("id") id: string,
        @Body() dto: MarkContactMessageDto,
    ) {
        return this.messages.mark(staff, id, dto.handled);
    }
}
