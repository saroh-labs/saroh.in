import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendContactMessageNotice } from "../../common/email";
import { recordWebsiteLead } from "../saroh-leads/lead-intake";
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

/** The topic as the page words it, for the team's notice. */
const TOPIC_WORDS: Record<ContactTopic, string> = {
    question: "A question before signing up",
    help: "Help with my account",
    bug: "Something's not working",
    other: "Partnerships or press",
};

/**
 * Messages people send from saroh.in/contact (DEC-137).
 *
 * Write-only from the public side: an anonymous caller can add a message and
 * learn nothing back. Staff read them in the admin console
 * (`AdminContactMessagesService`), and the team's own inbox is told each
 * one came in (`sendContactMessageNotice`). The writer is sent nothing, so a
 * stranger can't use the form to make Saroh write to someone else. A message
 * is deleted 12 months after it arrives (`contact-retention.ts`).
 *
 * A question before signing up also becomes Saroh's own sales lead
 * (DEC-169, U20), merged by email with one the waitlist made. The other
 * topics come from people already using Saroh, or from partners and press,
 * and are not leads.
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
        // After the message is saved, and never throwing: a lead that can't
        // be written is logged and the visitor's message stands.
        if (input.topic === "question") {
            await recordWebsiteLead({
                source: "WEBSITE",
                email: input.email,
                name: input.name,
                kind: input.kind,
            }).catch(() => "failed" as const);
        }
        // Stored first, so the notice failing loses nothing: the message is
        // in the admin console either way, and the visitor is told it went.
        const notice = await sendContactMessageNotice({
            topic: TOPIC_WORDS[input.topic],
            name: input.name,
            email: input.email,
            kind: input.kind,
            message: input.message.trim(),
        });
        // The topic and the outcome only: the rest is the writer's.
        this.logger.log(`contact message: ${input.topic}, notice ${notice}`);
        return { ok: true };
    }
}
