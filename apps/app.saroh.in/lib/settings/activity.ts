import { BUSINESS_TAB_PARAM, TEAM_TAB_PARAM } from "./search";

/**
 * Settings › Activity ("Saroh Settings" design): the audit stream said in
 * plain English — "Sanjay updated the GSTIN", "Priya invited
 * meera@ryeandco.in as Member" — each line with the place it happened.
 *
 * Only what the stream records. A settings change records the NAMES of the
 * fields it touched, never their values (the profile carries tax ids and
 * emails), so a line says "updated the invoice prefix", never "to RC". A
 * role change records from and to; an invitation, the role. Switching a
 * module on or off and changing plan are not recorded yet, so no line claims
 * them.
 *
 * Pure: the page reads the events (`lib/settings/activity-service.ts`) and
 * this turns each into a line, or drops it.
 */

/** The actions the page asks for: the business's settings and its team. */
export const ACTIVITY_ACTIONS = [
    "organization.onboard",
    "profile.update",
    "membership.invite",
    "membership.accept",
    "membership.role.update",
    "membership.remove",
] as const;

/** Someone an event names, as they are now; `null` when they are gone. */
export interface AuditPerson {
    name: string | null;
    email: string;
}

/** One row of `GET /organizations/:id/audit`. */
export interface AuditEventRow {
    id: string;
    action: string;
    actorUserId: string;
    targetType: string | null;
    targetId: string | null;
    outcome: string;
    metadata: unknown;
    createdAt: string;
    actor: AuditPerson | null;
    target: AuditPerson | null;
}

export interface ActivityLine {
    id: string;
    at: string;
    /** Who did it: their name, else their email. */
    who: string;
    /** What they did, as the rest of the sentence. */
    what: string;
    /** Where it lives, to open. */
    where: { label: string; href: string };
}

type BusinessTab = "identity" | "contact" | "tax" | "address";

const TAB_LABEL: Record<BusinessTab, string> = {
    identity: "Identity",
    contact: "Contact",
    tax: "Tax and invoices",
    address: "Registered address",
};

/**
 * Every field a settings save records, as a sentence names it and the
 * Business tab it is on. The four address lines are one thing to a person —
 * "the registered address" — so they share a phrase and say it once.
 */
export const FIELD_PHRASES: Partial<
    Record<string, { phrase: string; tab: BusinessTab }>
> = {
    name: { phrase: "the business name", tab: "identity" },
    legalName: { phrase: "the legal name", tab: "identity" },
    type: { phrase: "the type of business", tab: "identity" },
    logo: { phrase: "the logo", tab: "identity" },
    timezone: { phrase: "the time zone", tab: "identity" },
    contactEmail: { phrase: "the contact email", tab: "contact" },
    website: { phrase: "the website", tab: "contact" },
    gstRegistered: { phrase: "the GST registration", tab: "tax" },
    taxId: { phrase: "the GSTIN", tab: "tax" },
    invoicePrefix: { phrase: "the invoice prefix", tab: "tax" },
    invoiceNumberFormat: {
        phrase: "the invoice number format",
        tab: "tax",
    },
    deliveryGstRate: { phrase: "GST on delivery", tab: "tax" },
    deliverySacCode: { phrase: "the delivery SAC", tab: "tax" },
    addressLine1: { phrase: "the registered address", tab: "address" },
    addressLine2: { phrase: "the registered address", tab: "address" },
    city: { phrase: "the registered address", tab: "address" },
    postalCode: { phrase: "the registered address", tab: "address" },
    gstState: { phrase: "the state", tab: "address" },
    country: { phrase: "the country", tab: "address" },
};

const BUILT_IN_ROLES: Partial<Record<string, string>> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

const TEAM = (view: "people" | "roles" = "people") => ({
    label: "Team",
    href: `/settings/people?${TEAM_TAB_PARAM}=${view}`,
});

const business = (tab?: BusinessTab) => ({
    label: tab ? TAB_LABEL[tab] : "Business",
    href: tab
        ? `/settings/organization?${BUSINESS_TAB_PARAM}=${tab}`
        : "/settings/organization",
});

function personName(person: AuditPerson | null): string | null {
    if (!person) return null;
    // A blank name is no name: say the email instead.
    const name = person.name?.trim();
    if (name) return name;
    return person.email;
}

/** "a, b and c" */
function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

/**
 * "updated the GSTIN and the invoice prefix". Up to three things are named;
 * past that, the first two and how many more. A field this map does not know
 * is counted, not guessed at.
 */
function profileChange(fields: readonly string[]): {
    what: string;
    tab?: BusinessTab;
} {
    if (fields.length === 1 && fields[0] === "logo") {
        return { what: "changed the logo", tab: "identity" };
    }
    const phrases: string[] = [];
    const tabs: BusinessTab[] = [];
    let unknown = 0;
    for (const field of fields) {
        const known = FIELD_PHRASES[field];
        if (!known) {
            unknown += 1;
            continue;
        }
        if (!phrases.includes(known.phrase)) phrases.push(known.phrase);
        tabs.push(known.tab);
    }
    const tab = tabs[0];
    if (phrases.length === 0) {
        return { what: "updated the business details" };
    }
    if (phrases.length <= 3 && unknown === 0) {
        return { what: `updated ${list(phrases)}`, tab };
    }
    const named = phrases.slice(0, 2);
    const extra = phrases.length - named.length + unknown;
    const others = `${extra} other ${extra === 1 ? "detail" : "details"}`;
    return { what: `updated ${named.join(", ")} and ${others}`, tab };
}

/**
 * One event as a line, or `null` for one this page does not tell: an action
 * outside {@link ACTIVITY_ACTIONS}, or one that was refused or failed —
 * nothing changed, so there is nothing to report as a change.
 *
 * `roleLabels` names a role the business invented; the built-ins are known.
 */
export function activityLine(
    event: AuditEventRow,
    roleLabels: Readonly<Partial<Record<string, string>>> = {},
): ActivityLine | null {
    if (event.outcome !== "SUCCESS") return null;
    const meta = record(event.metadata);
    const role = (key: unknown): string | null =>
        typeof key === "string"
            ? (roleLabels[key] ?? BUILT_IN_ROLES[key] ?? null)
            : null;
    const who = personName(event.actor) ?? "Someone no longer here";
    const target = personName(event.target);
    const line = (what: string, where: ActivityLine["where"]) => ({
        id: event.id,
        at: event.createdAt,
        who,
        what,
        where,
    });

    switch (event.action) {
        case "organization.onboard":
            return line("set up the business", business());
        case "profile.update": {
            const fields = Array.isArray(meta.fields)
                ? meta.fields.filter((f): f is string => typeof f === "string")
                : [];
            const change = profileChange(fields);
            return line(change.what, business(change.tab));
        }
        case "membership.invite": {
            const as = role(meta.role);
            return line(
                `invited ${target ?? "someone"}${as ? ` as ${as}` : ""}`,
                TEAM(),
            );
        }
        case "membership.accept": {
            const as = role(meta.role);
            return line(`joined the team${as ? ` as ${as}` : ""}`, TEAM());
        }
        case "membership.role.update": {
            const from = role(meta.from);
            const to = role(meta.to);
            const whom = target ?? "someone";
            if (from && to && from !== to) {
                return line(`moved ${whom} from ${from} to ${to}`, TEAM());
            }
            if (to) return line(`made ${whom} ${to}`, TEAM());
            return line(`changed ${whom}'s role`, TEAM());
        }
        case "membership.remove":
            return line(`removed ${target ?? "someone"} from the team`, TEAM());
        default:
            return null;
    }
}

/** The events as lines, newest first as they came, dropping the untold. */
export function activityLines(
    events: readonly AuditEventRow[],
    roleLabels?: Readonly<Partial<Record<string, string>>>,
): ActivityLine[] {
    return events.flatMap((event) => {
        const line = activityLine(event, roleLabels);
        return line ? [line] : [];
    });
}
