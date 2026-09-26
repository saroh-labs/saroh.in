import type { BusinessTab } from "./activity-changes";
import {
    fieldsOf,
    moduleName,
    profileChange,
    record,
    recordedChanges,
    text,
} from "./activity-changes";
import { BUSINESS_TAB_PARAM, TEAM_TAB_PARAM } from "./search";

/**
 * Settings › Activity ("Saroh Settings" design): the audit stream said in
 * plain English — "Priya changed the invoice prefix to RC", "Priya invited
 * meera@ryeandco.in as Member" — each line with the place it happened.
 *
 * Only what the stream records. A settings save records the NAMES of the
 * fields it touched and, since #509, each business detail's value before
 * and after (`metadata.changes`); the contact email and the website stay
 * names only. So a line says the new value when there is one short enough
 * to read in a sentence, and "updated the invoice prefix" for an earlier
 * save that kept none. A role change records from and to; an invitation,
 * the role; a module switched on or off, its name; a plan, from and to.
 *
 * Pure: the page reads the events (`lib/settings/activity-service.ts`) and
 * this turns each into a line, or drops it. The sheet a row opens, with
 * the whole of what changed, is `activity-detail.ts`; the words for a
 * field and its value are `activity-changes.ts`.
 */

/** The actions the page asks for: the business's settings and its team. */
export const ACTIVITY_ACTIONS = [
    "organization.onboard",
    "profile.update",
    "storefront.hours.update",
    "organization.module.enabled",
    "organization.module.disabled",
    "organization.plan.changed",
    "membership.invite",
    "membership.accept",
    "membership.role.update",
    "membership.remove",
] as const;

/** Someone an event names, as they are now; `null` when they are gone. */
export interface AuditPerson {
    name: string | null;
    /** Null for Saroh support, whose operator is not named. */
    email: string | null;
    /** Their role key here now; null when they left. Absent from an older API. */
    role?: string | null;
    /** A change Saroh support made for the business. */
    operator?: true;
}

/** One row of `GET /organizations/:id/audit`. */
export interface AuditEventRow {
    id: string;
    action: string;
    /** Null for a change Saroh support made: the operator is not named. */
    actorUserId: string | null;
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

const TAB_LABEL: Record<BusinessTab, string> = {
    identity: "Identity",
    contact: "Contact",
    tax: "Tax and invoices",
    hours: "Hours",
    address: "Address",
};

const BUILT_IN_ROLES: Partial<Record<string, string>> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

export type RoleLabels = Readonly<Partial<Record<string, string>>>;

const TEAM = (view: "people" | "roles" = "people") => ({
    label: "Team",
    href: `/settings/people?${TEAM_TAB_PARAM}=${view}`,
});
const MODULES = { label: "Modules", href: "/settings/modules" };
const PLAN = { label: "Plan and billing", href: "/settings/billing" };

const business = (tab?: BusinessTab) => ({
    label: tab ? TAB_LABEL[tab] : "Business",
    href: tab
        ? `/settings/organization?${BUSINESS_TAB_PARAM}=${tab}`
        : "/settings/organization",
});

export function personName(person: AuditPerson | null): string | null {
    if (!person) return null;
    // A blank name is no name: say the email instead.
    const name = person.name?.trim();
    if (name) return name;
    return person.email;
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
    roleLabels: RoleLabels = {},
): ActivityLine | null {
    if (event.outcome !== "SUCCESS") return null;
    const meta = record(event.metadata);
    const role = (key: unknown) => roleName(key, roleLabels);
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
            const change = profileChange(fieldsOf(meta), recordedChanges(meta));
            return line(change.what, business(change.tab));
        }
        case "storefront.hours.update":
            return line("changed the opening hours", business("hours"));
        case "organization.module.enabled":
            return line(
                `switched on ${moduleName(meta, event.targetId)}`,
                MODULES,
            );
        case "organization.module.disabled":
            return line(
                `switched off ${moduleName(meta, event.targetId)}`,
                MODULES,
            );
        case "organization.plan.changed": {
            const from = text(meta.from);
            const to = text(meta.to);
            if (from && to)
                return line(`moved the plan from ${from} to ${to}`, PLAN);
            if (to) return line(`moved the business to the ${to} plan`, PLAN);
            return line("changed the plan", PLAN);
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

export function roleName(key: unknown, roleLabels: RoleLabels): string | null {
    return typeof key === "string"
        ? (roleLabels[key] ?? BUILT_IN_ROLES[key] ?? null)
        : null;
}

/** The events as lines, newest first as they came, dropping the untold. */
export function activityLines(
    events: readonly AuditEventRow[],
    roleLabels?: RoleLabels,
): ActivityLine[] {
    return events.flatMap((event) => {
        const line = activityLine(event, roleLabels);
        return line ? [line] : [];
    });
}
