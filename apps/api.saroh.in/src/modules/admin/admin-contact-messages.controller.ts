import { Get, Query } from "@nestjs/common";

import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminContactMessagesService } from "./admin-contact-messages.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { ListContactMessagesDto } from "./dto";

/**
 * Messages from saroh.in/contact (DEC-137; the public side is
 * `POST /public/contact-messages`). A message is a person's name, email and
 * words, so reading the list needs `organization:pii:read`. There is no
 * write: the team replies from its own mailbox.
 */
@AdminRoutes()
export class AdminContactMessagesController {
    constructor(private readonly messages: AdminContactMessagesService) {}

    @Get("contact-messages")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    listContactMessages(@Query() query: ListContactMessagesDto) {
        return this.messages.list(query);
    }
}
