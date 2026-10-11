import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { WaitlistKind } from "../waitlist/waitlist-keys";
import type { ContactTopic } from "./dto";

export interface SendContactMessageInput {
    topic: ContactTopic;
    name: string;
    email: string;
    kind?: WaitlistKind;
    message: string;
    /** A digest of the writer's address; never the address itself. */
    ipHash?: string;
}

/**
 * Messages people send from saroh.in/contact (DEC-137).
 *
 * Write-only from the public side: an anonymous caller can add a message and
 * learn nothing back. Staff read them in the admin console
 * (`AdminContactMessagesService`). Nothing is emailed: neither the writer nor
 * the team is sent anything by this service, so a stranger can't use the form
 * to make Saroh send mail. A message is deleted 12 months after it arrives
 * (`contact-retention.ts`).
 */
@Injectable()
export class ContactMessagesService {
    private readonly logger = new Logger(ContactMessagesService.name);

    async send(input: SendContactMessageInput): Promise<{ ok: true }> {
        await prisma.contactMessage.create({
            data: {
                topic: input.topic,
                name: input.name,
                email: input.email,
                kind: input.kind ?? null,
                message: input.message.trim(),
                ipHash: input.ipHash ?? null,
            },
            select: { id: true },
        });
        // The topic only: the name, the email and the words are the writer's.
        this.logger.log(`contact message: ${input.topic}`);
        return { ok: true };
    }
}
