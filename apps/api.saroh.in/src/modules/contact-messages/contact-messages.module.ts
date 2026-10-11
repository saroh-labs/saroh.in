import { Module } from "@nestjs/common";

import { ContactMessagesService } from "./contact-messages.service";
import { PublicContactMessagesController } from "./public-contact-messages.controller";

/**
 * Messages from saroh.in/contact (DEC-137). Guardless and org-agnostic on
 * the public side: the writer need not have an account, and a message
 * belongs to no business. Staff read them through the admin module, and the
 * waitlist's retention sweep deletes them after 12 months
 * (`contact-retention.ts`).
 */
@Module({
    controllers: [PublicContactMessagesController],
    providers: [ContactMessagesService],
})
export class ContactMessagesModule {}
