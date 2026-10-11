import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { ContactTopic } from "../contact-messages/dto";

const PAGE_SIZE = 50;

export interface ContactMessageRow {
    id: string;
    /** One of the form's topics (`CONTACT_TOPICS`). */
    topic: string;
    name: string;
    email: string;
    /** One of the waitlist's kinds of business, or null when none was chosen. */
    kind: string | null;
    message: string;
    createdAt: Date;
}

export interface ContactMessagePage {
    items: ContactMessageRow[];
    nextCursor?: string;
}

/**
 * Messages people send from saroh.in/contact (DEC-137), newest first.
 *
 * Read-only: the team answers from its own mailbox, and nothing here marks
 * a message answered. Every row is personal data (a name, an email and the
 * writer's own words) and belongs to no business, so the whole list sits
 * behind `organization:pii:read`, which Platform Owners and Support hold.
 * The digest of the writer's address is never returned.
 */
@Injectable()
export class AdminContactMessagesService {
    async list(query: {
        topic?: ContactTopic;
        cursor?: string;
    }): Promise<ContactMessagePage> {
        const rows = await prisma.contactMessage.findMany({
            where: query.topic ? { topic: query.topic } : {},
            select: {
                id: true,
                topic: true,
                name: true,
                email: true,
                kind: true,
                message: true,
                createdAt: true,
            },
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: PAGE_SIZE + 1,
            // Newest first.
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        const hasMore = rows.length > PAGE_SIZE;
        const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        return {
            items: page,
            nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
        };
    }
}
