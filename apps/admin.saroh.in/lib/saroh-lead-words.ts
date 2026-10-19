/**
 * Saroh's own sales leads (DEC-169, admin console U20): the shapes the API
 * sends and the words the board says. Client-safe: no `next/headers`, so the
 * board, the lead sheet and the log sheet import it directly.
 */

export const LEAD_STAGES = [
    "NEW",
    "TALKED",
    "DEMO",
    "TRIAL",
    "WON",
    "LOST",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export type LeadSource = "WEBSITE" | "WAITLIST" | "ADDED";
export type LeadOwnedHow = "ADDED" | "ASSIGNED";
export type ContactKind = "CALL" | "VISIT" | "MESSAGE";

export const STAGE_LABEL: Record<LeadStage, string> = {
    NEW: "New",
    TALKED: "Talked",
    DEMO: "Demo given",
    TRIAL: "In trial",
    WON: "Won",
    LOST: "Lost",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
    WEBSITE: "Enquiry",
    WAITLIST: "Waitlist",
    ADDED: "Added",
};

export const CONTACT_KINDS: readonly ContactKind[] = [
    "CALL",
    "VISIT",
    "MESSAGE",
];

export const CONTACT_LABEL: Record<ContactKind, string> = {
    CALL: "Call",
    VISIT: "Visit",
    MESSAGE: "Message",
};

export interface LeadOwner {
    platformAdminId: string;
    name: string;
}

export interface LeadCard {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    kind: string | null;
    source: LeadSource;
    stage: LeadStage;
    stagedAt: string;
    followUpOn: string | null;
    overdue: boolean;
    owner: LeadOwner | null;
    ownedHow: LeadOwnedHow | null;
    lastContactAt: string | null;
    createdAt: string;
}

export interface LeadContact {
    id: string;
    kind: ContactKind;
    happenedAt: string;
    minutes: number | null;
    summary: string;
    feedback: string | null;
    by: string | null;
}

export interface LeadDetail extends LeadCard {
    signUpEmail: string | null;
    emailAt: string | null;
    notes: string | null;
    wonOrganization: { id: string; name: string } | null;
    wonAt: string | null;
    lostReason: string | null;
    ownerSince: string | null;
    websiteSeenAt: string | null;
    log: LeadContact[];
    mayAssign: boolean;
    mayWrite: boolean;
}

export interface LeadsBoard {
    scope: "all" | "own";
    today: string;
    leads: LeadCard[];
    truncated: boolean;
    counts: Record<LeadStage, number>;
    overdue: number;
    unowned: number | null;
    mayAssign: boolean;
}

export interface LeadManager {
    platformAdminId: string;
    name: string;
    openLeads: number;
}

/** The board's owner filter, for staff who see every lead. */
export type OwnerFilter = "all" | "unowned";

export function readOwnerFilter(value: string | undefined): OwnerFilter {
    return value === "unowned" ? "unowned" : "all";
}

const SHORT_DAY = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
});

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
    return Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
            DAY_MS,
    );
}

/** "24 Oct" for a `YYYY-MM-DD` day. */
export function shortDay(day: string): string {
    return SHORT_DAY.format(new Date(`${day}T00:00:00Z`));
}

/**
 * The card's follow-up line: "Overdue by 4 days", "Follow up today",
 * "Follow up tomorrow", "Follow up 24 Oct", or nothing. A closed lead has
 * nothing to follow up.
 */
export function followUpWords(
    lead: Pick<LeadCard, "stage" | "followUpOn" | "overdue">,
    today: string,
): string | null {
    if (lead.stage === "WON" || lead.stage === "LOST") return null;
    if (!lead.followUpOn) return null;
    const days = daysBetween(today, lead.followUpOn);
    if (lead.overdue || days < 0) {
        const late = Math.max(1, -days);
        return `Overdue by ${late} ${late === 1 ? "day" : "days"}`;
    }
    if (days === 0) return "Follow up today";
    if (days === 1) return "Follow up tomorrow";
    return `Follow up ${shortDay(lead.followUpOn)}`;
}

/** Where it came from, and the kind of business when known. */
export function leadLine(lead: Pick<LeadCard, "source" | "kind" | "city">) {
    return [SOURCE_LABEL[lead.source], lead.kind, lead.city]
        .filter(Boolean)
        .join(" · ");
}

/** "Priya Sharma · assigned" or "Not given to anyone". */
export function ownerWords(lead: Pick<LeadCard, "owner" | "ownedHow">) {
    if (!lead.owner) return "Not given to anyone yet";
    return lead.ownedHow === "ASSIGNED"
        ? `${lead.owner.name} · given to them`
        : `${lead.owner.name} · added it`;
}

/** The leads in one stage, as the board's column shows them. */
export function inStage(leads: readonly LeadCard[], stage: LeadStage) {
    return leads.filter((lead) => lead.stage === stage);
}

/** Why a stage move can't go yet, or null when it can. */
export function stageMoveProblem(input: {
    from: LeadStage;
    to: LeadStage;
    organizationId: string;
    lostReason: string;
}): string | null {
    if (input.to === input.from) return "It's already in this stage.";
    if (input.to === "WON" && !input.organizationId) {
        return "Pick the business this lead became.";
    }
    if (input.to === "LOST" && input.lostReason.trim().length < 3) {
        return "Say why it was lost.";
    }
    return null;
}
