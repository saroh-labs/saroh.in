import type { prisma } from "@saroh/database";

import type { HomeEvidence, HomeNumber } from "./home-model";
import { EVIDENCE_LIMIT, overdueTag, personName } from "./home-model";

/**
 * Home's CRM sources: follow-ups past their due date, and the counts that
 * lead to Leads and Contacts. Moved out of `HomeService` unchanged beside
 * F2's people sources, so the service stays the composition of them.
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

/** Counts that are destinations: open leads, and everyone on file. */
export async function crmNumbers(
    db: Db,
    organizationId: string,
    canReadLeads: boolean,
): Promise<HomeNumber[]> {
    const [openLeads, contacts] = await Promise.all([
        canReadLeads
            ? db.lead.count({
                  where: { organizationId, status: "OPEN" },
              })
            : Promise.resolve(0),
        db.contact.count({ where: { organizationId } }),
    ]);

    const out: HomeNumber[] = [];
    if (openLeads > 0) {
        out.push({
            key: "OPEN_LEADS",
            label: "Open leads",
            value: openLeads,
            // `?view=` is the DataView filter contract: this lands on Leads
            // with the open filter already applied, not on a list the
            // merchant has to narrow again by hand.
            href: "/leads?view=open",
            moduleKey: "CRM",
        });
    }
    if (contacts > 0) {
        out.push({
            key: "CONTACTS",
            label: "Contacts",
            value: contacts,
            href: "/contacts",
            moduleKey: "CRM",
        });
    }
    return out;
}
