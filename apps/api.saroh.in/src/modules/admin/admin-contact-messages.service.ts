import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { ContactTopic } from "../contact-messages/dto";
import { normaliseEmail } from "../waitlist/waitlist-keys";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

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
    /** When staff marked it handled; null while open. */
    handledAt: Date | null;
    /** Where else this person appears in the console, for its links. */
    links: {
        /** One of Saroh's leads has this address. */
        lead: boolean;
        /** They are on the waitlist under this address. */
        waitlist: boolean;
        /** Their account, when one has this address. */
        userId: string | null;
    };
}

export interface ContactMessagePage {
    items: ContactMessageRow[];
    nextCursor?: string;
}

/**
 * Messages people send from saroh.in/contact (DEC-137), newest first.
 *
 * The team answers from its own mailbox; the console only records that a
 * message was handled, so two people on support can tell what is still
 * open. Every row is personal data (a name, an email and the writer's own
 * words) and belongs to no business, so the whole list sits behind
 * `organization:pii:read`, which Platform Owners and Support hold. The
 * digest of the writer's address is never returned.
 */
@Injectable()
export class AdminContactMessagesService {
    constructor(private readonly audit: AdminAuditService) {}

    async list(query: {
        topic?: ContactTopic;
        state?: "open" | "handled";
        email?: string;
        cursor?: string;
    }): Promise<ContactMessagePage> {
        const where: Prisma.ContactMessageWhereInput = {
            ...(query.topic ? { topic: query.topic } : {}),
            ...(query.state === "open"
                ? { handledAt: null }
                : query.state === "handled"
                  ? { handledAt: { not: null } }
                  : {}),
            ...(query.email
                ? { email: { equals: query.email, mode: "insensitive" } }
                : {}),
        };
        const rows = await prisma.contactMessage.findMany({
            where,
            select: {
                id: true,
                topic: true,
                name: true,
                email: true,
                kind: true,
                message: true,
                createdAt: true,
                handledAt: true,
            },
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: PAGE_SIZE + 1,
            // Newest first.
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        const hasMore = rows.length > PAGE_SIZE;
        const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        const links = await linksFor(page.map((row) => row.email));
        return {
            items: page.map((row) => ({
                ...row,
                links: links(row.email),
            })),
            nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
        };
    }

    /** Mark one handled, or open again; on the record either way. */
    async mark(
        staff: PlatformAdminInfo,
        id: string,
        handled: boolean,
    ): Promise<{ id: string; handledAt: Date | null }> {
        return prisma.$transaction(async (tx) => {
            const { count } = await tx.contactMessage.updateMany({
                where: { id },
                data: handled
                    ? { handledAt: new Date(), handledByUserId: staff.userId }
                    : { handledAt: null, handledByUserId: null },
            });
            if (count === 0) throw new NotFoundException("Message not found");
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.ReportsResolve,
                action: handled
                    ? "contact-message.handled"
                    : "contact-message.reopened",
                targetType: "contact-message",
                targetId: id,
                outcome: AdminAuditOutcome.Success,
            });
            const row = await tx.contactMessage.findUniqueOrThrow({
                where: { id },
                select: { id: true, handledAt: true },
            });
            return row;
        });
    }
}

/**
 * Whether each address is also a lead, on the waitlist or an account, read
 * in three queries for the whole page. Leads and the waitlist compare by
 * the normalised key (`normaliseEmail`), accounts by the address itself.
 */
async function linksFor(
    emails: string[],
): Promise<(email: string) => ContactMessageRow["links"]> {
    if (emails.length === 0) {
        return () => ({ lead: false, waitlist: false, userId: null });
    }
    const keys = [...new Set(emails.map((e) => normaliseEmail(e).key))];
    const lower = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    const [leads, waiting, users] = await Promise.all([
        prisma.sarohLead.findMany({
            where: {
                OR: [
                    { emailKey: { in: keys } },
                    { signUpEmailKey: { in: keys } },
                ],
            },
            select: { emailKey: true, signUpEmailKey: true },
        }),
        prisma.waitlistSignup.findMany({
            where: { emailKey: { in: keys } },
            select: { emailKey: true },
        }),
        prisma.user.findMany({
            where: { email: { in: lower } },
            select: { id: true, email: true },
        }),
    ]);
    const leadKeys = new Set(
        leads.flatMap((row) => [row.emailKey, row.signUpEmailKey]),
    );
    const waitKeys = new Set(waiting.map((row) => row.emailKey));
    const userIds = new Map(
        users.map((row) => [row.email.toLowerCase(), row.id]),
    );
    return (email) => {
        const key = normaliseEmail(email).key;
        return {
            lead: leadKeys.has(key),
            waitlist: waitKeys.has(key),
            userId: userIds.get(email.trim().toLowerCase()) ?? null,
        };
    };
}
