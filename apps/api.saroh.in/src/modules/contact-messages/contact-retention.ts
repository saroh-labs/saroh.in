import { prisma } from "@saroh/database";

import { deleteStaleWebsiteLeads } from "../saroh-leads/lead-retention";

/** How long a message from saroh.in/contact is kept. */
export const CONTACT_MESSAGE_KEEP_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete the messages from saroh.in/contact that arrived more than 12 months
 * before `now` (DEC-137): the rule the waitlist, a link-preview report and a
 * QR code maker email already follow. Returns how many went.
 *
 * An unconverted sales lead an enquiry made goes with it (DEC-169, R35,
 * `saroh-leads/lead-retention.ts`), unless a waitlist entry with its email
 * still holds it. The messages go first, so a lead failing loses nothing.
 *
 * It has no job of its own: the waitlist's daily retention sweep calls it
 * (`waitlist/waitlist-retention.handler.ts`), which is the one chain that
 * clears what saroh.in's visitors leave with Saroh.
 */
export async function deleteOldContactMessages(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - CONTACT_MESSAGE_KEEP_DAYS * DAY_MS);
    const { count } = await prisma.contactMessage.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
    await deleteStaleWebsiteLeads(now);
    return count;
}
