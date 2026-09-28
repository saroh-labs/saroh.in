import { CAPABILITY_GROUP_LABEL } from "./capability-groups";
import type { Capability, Role, RoleCatalogue } from "./roles";

/**
 * A person's extra permissions on Team (F17, DEC-039; "Saroh Settings"
 * design, Team): what the column shows, and what the Edit drawer offers.
 *
 * Pure: the API decides. It refuses anything beyond the viewer's own reach,
 * a change to their own list, and a person who can do more than they can;
 * this only keeps the screen from offering what would be refused.
 */

/** A role's whole grant: an invented role's resolved set, else its list. */
export function roleGrants(role: Role | undefined): ReadonlySet<string> {
    return new Set(role?.grants ?? role?.actions ?? []);
}

/** A person's extras that add something to the role they hold. */
export function extrasBeyond(
    extras: readonly string[] | undefined,
    grants: ReadonlySet<string>,
): string[] {
    return (extras ?? []).filter((a) => !grants.has(a));
}

/** Whether anyone on the roster holds an extra; the column shows only then. */
export function anyoneHasExtras(
    members: readonly { extraActions?: string[] }[],
): boolean {
    return members.some((m) => (m.extraActions?.length ?? 0) > 0);
}

/** Two lists hold the same permissions, whatever their order. */
export function sameExtras(
    a: readonly string[],
    b: readonly string[],
): boolean {
    const left = new Set(a);
    const right = new Set(b);
    return (
        left.size === right.size && Array.from(left).every((x) => right.has(x))
    );
}

/**
 * The names of a person's extras for the column's chips. A key the catalogue
 * doesn't know (an older app, a failed read) is left out rather than shown
 * as a code.
 */
export function extraLabels(
    extras: readonly string[],
    catalogue: RoleCatalogue | null,
): string[] {
    const byAction = new Map(
        (catalogue?.capabilities ?? []).map((c) => [c.action, c.label]),
    );
    return extras.flatMap((a) => {
        const label = byAction.get(a);
        return label ? [label] : [];
    });
}

export type ExtraState = "role" | "on" | "off";

export interface ExtraChoice {
    capability: Capability;
    /** Comes with the role (shown locked), given as an extra, or not held. */
    state: ExtraState;
}

export interface ExtraGroup {
    group: string;
    label: string;
    choices: ExtraChoice[];
}

/**
 * The drawer's list, grouped as the role editor groups it. It offers only
 * what the viewer holds themselves (implied holds count: `myActions` is what
 * the API resolved for them); what the role already grants shows locked,
 * because an extra can only add. `myActions` null means unknown, and nothing
 * is held back — the API still decides.
 */
export function extraGroups({
    catalogue,
    grants,
    draft,
    myActions,
}: {
    catalogue: RoleCatalogue;
    grants: ReadonlySet<string>;
    draft: readonly string[];
    myActions: readonly string[] | null;
}): ExtraGroup[] {
    const mine = myActions ? new Set(myActions) : null;
    const chosen = new Set(draft);
    const byGroup = new Map<string, ExtraChoice[]>();
    for (const capability of catalogue.capabilities) {
        const fromRole = grants.has(capability.action);
        if (!fromRole && mine && !mine.has(capability.action)) continue;
        const list = byGroup.get(capability.group) ?? [];
        list.push({
            capability,
            state: fromRole
                ? "role"
                : chosen.has(capability.action)
                  ? "on"
                  : "off",
        });
        byGroup.set(capability.group, list);
    }
    return catalogue.groups.flatMap((group) => {
        const choices = byGroup.get(group);
        return choices
            ? [
                  {
                      group,
                      label: CAPABILITY_GROUP_LABEL[group] ?? group,
                      choices,
                  },
              ]
            : [];
    });
}

/**
 * Why the drawer shows no switches for this person, in words, or null when
 * it does. The API refuses each of these; the drawer says so first.
 */
export function extrasLockedReason({
    isSelf,
    canEdit,
    reviewer,
    beyondViewer,
    name,
}: {
    isSelf: boolean;
    canEdit: boolean;
    reviewer: boolean;
    beyondViewer: boolean;
    name: string;
}): string | null {
    if (!canEdit) {
        return "Only someone who can change roles can give extra permissions.";
    }
    if (isSelf) {
        return "Nobody changes their own permissions. Ask someone else on the team if you need more.";
    }
    if (beyondViewer) {
        return `${name} can do more than you can here, so you cannot change their permissions.`;
    }
    if (reviewer) {
        return "A reviewer looks at the websites they were asked to review, and nothing else. Choose another role to give more.";
    }
    return null;
}

/**
 * Whether a person can do more than the viewer: their role or any extra
 * beyond what the viewer holds. Unknown viewer: let the API decide.
 */
export function beyondViewer(
    grants: ReadonlySet<string>,
    extras: readonly string[],
    myActions: readonly string[] | null,
): boolean {
    if (myActions === null) return false;
    const mine = new Set(myActions);
    return [...Array.from(grants), ...extras].some((a) => !mine.has(a));
}

/**
 * The line under the list, after the design: the role alone, or the role
 * "plus" what was added. Extras only ever add.
 */
export function extrasSummary(
    roleLabel: string,
    added: readonly string[],
): string | null {
    if (added.length === 0) return null;
    const list = new Intl.ListFormat("en", { type: "conjunction" }).format(
        added.map((l) => l.charAt(0).toLowerCase() + l.slice(1)),
    );
    return `${roleLabel} plus ${list}. Extras only ever add — they cannot take away what ${roleLabel} already allows.`;
}
