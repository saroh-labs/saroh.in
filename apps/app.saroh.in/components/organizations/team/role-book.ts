import {
    ROLES,
    ROLE_BLURB,
    ROLE_LABEL,
    ROLE_PLAIN,
} from "@/components/organizations/roles/role-words";
import { count } from "@/lib/format/plural";
import {
    CALENDAR_ONLY_BLURB,
    CALENDAR_ONLY_PLAIN,
    CALENDAR_ONLY_ROLE,
} from "@/lib/organizations/calendar-only";
import { beyondViewer, roleGrants } from "@/lib/organizations/extras";
import type { OrganizationMember } from "@/lib/organizations/members";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import type { OrganizationRole } from "@/lib/organizations/service";

/** A person's name, or their email while they have not given one. */
export function nameOf(person: { name: string | null; email: string }): string {
    const name = person.name?.trim();
    // A blank name is no name: the email stands in.
    if (name) return name;
    return person.email;
}

/**
 * Every role the business has, and the questions the roster asks of one.
 *
 * One object rather than four helpers passed separately, because all three
 * places a person gets a role — the roster row, the edit drawer and the
 * invite dialog — must answer these the same way. Two answers to "what is
 * this role called" is how a Stock clerk shows as "Member" in one place.
 */
export interface RoleBook {
    all: Role[];
    labelOf: (key: string) => string;
    blurbOf: (key: string) => string;
    /** What it opens, in a few words ("can open everything"). */
    plainOf: (key: string) => string;
    /**
     * False when the role can do something the viewer cannot. The API refuses
     * to hand out, change or remove such a role; the screen says so first.
     */
    withinReach: (key: string) => boolean;
    /** Everything the role grants, implied holds included (F17). */
    grantsOf: (key: string) => ReadonlySet<string>;
    /** The same question of a person: their role and their extras (F17). */
    personWithinReach: (member: OrganizationMember) => boolean;
    /** Names for extra permissions; null when the list could not be read. */
    catalogue: RoleCatalogue | null;
    /** What the viewer holds; null when unknown, and nothing is held back. */
    myActions: string[] | null;
}

export function isBuiltIn(key: string): key is OrganizationRole {
    return (ROLES as readonly string[]).includes(key);
}

/**
 * The book for one business's roles, as the roster, the drawer and the
 * invite sheet all read it.
 */
export function roleBook({
    roles,
    organizationName,
    catalogue,
    myActions,
}: {
    roles: Role[];
    organizationName: string;
    catalogue: RoleCatalogue | null;
    myActions: string[] | null;
}): RoleBook {
    const byKey = new Map(roles.map((r) => [r.key, r]));
    const book: RoleBook = {
        all: roles,
        labelOf: (key) =>
            byKey.get(key)?.label ?? (isBuiltIn(key) ? ROLE_LABEL[key] : key),
        blurbOf: (key) => {
            if (isBuiltIn(key)) return ROLE_BLURB[key];
            if (key === CALENDAR_ONLY_ROLE) return CALENDAR_ONLY_BLURB;
            const n = byKey.get(key)?.actions.length ?? 0;
            return `Made for ${organizationName}. Whoever holds it can do exactly what was ticked for it: ${count(n, "permission")}.`;
        },
        plainOf: (key) => {
            if (isBuiltIn(key)) return ROLE_PLAIN[key];
            if (key === CALENDAR_ONLY_ROLE) return CALENDAR_ONLY_PLAIN;
            const n = byKey.get(key)?.actions.length ?? 0;
            return count(n, "permission");
        },
        withinReach: (key) => {
            const role = byKey.get(key);
            // Unknown role or unknown viewer: let the API decide, it will.
            if (!role || myActions === null) return true;
            return role.actions.every((a) => myActions.includes(a));
        },
        grantsOf: (key) => roleGrants(byKey.get(key)),
        personWithinReach: (m) =>
            book.withinReach(m.roleKey ?? m.role) &&
            !beyondViewer(new Set(), m.extraActions ?? [], myActions),
        catalogue,
        myActions,
    };
    return book;
}
