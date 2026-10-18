import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { maskEmail } from "../waitlist/waitlist-keys";
import { leadEmail, textOrNull } from "./lead-rules";

const logger = new Logger("SarohLeadIntake");

export interface WebsiteLeadInput {
    /** WEBSITE for a saroh.in enquiry, WAITLIST for a waitlist entry. */
    source: "WEBSITE" | "WAITLIST";
    email: string;
    /** The business's name, or the person's, as they gave it. */
    name?: string | null;
    kind?: string | null;
    city?: string | null;
    now?: Date;
}

export type WebsiteLeadOutcome = "created" | "merged" | "failed";

/**
 * Turn a saroh.in enquiry or a waitlist entry into Saroh's own sales lead
 * (DEC-169, U20), one per person: an email that is already on a lead (as its
 * email or its sign-up email) is merged into it, which only marks when the
 * website last saw it and fills what the lead didn't know. A new one is
 * unowned, in New, until Support or a Platform owner assigns it.
 *
 * Called after the enquiry or the waitlist entry is saved, and **never
 * throws**: a lead that couldn't be written is logged (the email masked) and
 * the visitor's own write stands.
 */
export async function recordWebsiteLead(
    input: WebsiteLeadInput,
    db: Pick<Prisma.TransactionClient, "sarohLead"> = prisma,
): Promise<WebsiteLeadOutcome> {
    const now = input.now ?? new Date();
    let masked = "an address";
    try {
        const { email, key } = leadEmail(input.email);
        masked = maskEmail(email);
        if (!key.includes("@")) return "failed";
        const fill = {
            kind: textOrNull(input.kind),
            city: textOrNull(input.city),
        };
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const existing = await db.sarohLead.findFirst({
                where: { OR: [{ emailKey: key }, { signUpEmailKey: key }] },
                select: { id: true, kind: true, city: true },
            });
            if (existing) {
                await db.sarohLead.update({
                    where: { id: existing.id },
                    data: {
                        websiteSeenAt: now,
                        ...(existing.kind ? {} : { kind: fill.kind }),
                        ...(existing.city ? {} : { city: fill.city }),
                    },
                    select: { id: true },
                });
                return "merged";
            }
            try {
                await db.sarohLead.create({
                    data: {
                        name: textOrNull(input.name) ?? email,
                        email,
                        emailKey: key,
                        emailAt: now,
                        source: input.source,
                        stage: "NEW",
                        stagedAt: now,
                        websiteSeenAt: now,
                        ...fill,
                    },
                    select: { id: true },
                });
                logger.log(`saroh lead: new ${input.source} lead ${masked}`);
                return "created";
            } catch (error) {
                // Two writes for one email at once: the unique key decided,
                // so the second merges into the first.
                if (prismaErrorCode(error) !== "P2002") throw error;
            }
        }
        return "failed";
    } catch (error) {
        logger.error(
            `saroh lead: could not record a ${input.source} lead for ${masked}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        return "failed";
    }
}
