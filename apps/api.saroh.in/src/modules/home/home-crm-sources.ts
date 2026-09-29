import type { prisma } from "@saroh/database";

import type { HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT, overdueTag, personName } from "./home-model";

/**
 * Home's CRM source: follow-ups past their due date. (The counts that led
 * to Leads and Contacts fed the numbers band, removed in Z5.) Moved out of
 * `HomeService` unchanged beside F2's people sources, so the service stays
 * the composition of them.
 */

type Db = typeof prisma;

/**
 * Overdue follow-up tasks, oldest due date first, with the lead and person
 * each one is about.
 */
export async function overdueFollowUps(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<{ count: number; evidence: HomeEvidence[] }> {
    const where = {
        organizationId,
        dueAt: { lt: now },
        completedAt: null,
    };

    const [count, rows] = await Promise.all([
        db.activity.count({ where }),
        db.activity.findMany({
            where,
            orderBy: { dueAt: "asc" },
            take: EVIDENCE_LIMIT,
            include: { lead: { include: { contact: true } } },
        }),
    ]);

    return {
        count,
        evidence: rows.map((row) => ({
            id: row.id,
            title: row.lead.title,
            // `Lead.contactId` is required, so a lead always has a contact
            // — no null branch to guard.
            subtitle: personName(row.lead.contact),
            at: row.dueAt?.toISOString() ?? null,
            // A Lead's value is a bare integer in minor units with no
            // currency recorded anywhere on the row — see HomeEvidence.
            amountMinor: row.lead.value,
            currency: null,
            href: `/leads/${row.lead.id}`,
            // The where asked for a due date before now.
            ...(row.dueAt
                ? { tag: overdueTag(row.dueAt, now), tone: "bad" as const }
                : {}),
        })),
    };
}
