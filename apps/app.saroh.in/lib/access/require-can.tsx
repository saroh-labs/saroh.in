import type { ReactNode } from "react";

import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/lib/access/who-can-change";
import { knownRoleName } from "@/lib/organizations/role-name";
import type { Organization } from "@/lib/organizations/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * The first line of every `new`, `edit` and `import` page under
 * `app/(shell)` (UX audit, 10 Oct 2026).
 *
 * A page that checked nothing opened for anyone who typed its address, or
 * who held a narrow role the business made: they filled the form, pressed
 * Save and only then learned they could not. `requireCan` asks the question
 * the API will ask of the write, before the form is drawn:
 *
 *     const access = await requireCan("contact:write", { thing: "new customers" });
 *     if (access.denied) return access.denied;
 *
 * `action` is the permission the API controller's write asks, in the API's
 * own words. Several means any one will do. The page is denied only when the
 * API said what this person may do and it isn't there. With no permissions
 * to read (an older or cached response) it opens and the API decides, the
 * rule `billing/plans/new` already followed: a page that shuts on a failed
 * read is worse than one whose save is refused.
 *
 * It decides nothing. The API stays the authority, and refuses the write
 * whatever this draws.
 */
export interface Access {
    organization: Organization | null;
    /** Whether the resolved permissions hold `action`. Nothing when unknown. */
    may: (action: string) => boolean;
    /** The denial to return, or null when the page may open. */
    denied: ReactNode | null;
}

export interface Says {
    /** The menu's name for it, or what was about to be done. */
    thing: string;
    /** What only the owner's role reaches. */
    ownerOnly?: boolean;
    /**
     * Where Back goes, and the permission that place asks. Without it the
     * person goes Home: a Back that lands on a second denial is no way back.
     */
    back?: { href: string; label: string; needs?: string };
}

/** Whether this person holds one of `action`, or it isn't known yet. */
export function canOrUnknown(
    organization: { actions?: readonly string[] } | null | undefined,
    action: string | readonly string[],
): boolean {
    const held = organization?.actions;
    if (!held) return true;
    const asked = typeof action === "string" ? [action] : action;
    return asked.some((a) => held.includes(a));
}

/** The denial itself, for a page that already holds the organization. */
export function deniedFor(
    organization: Pick<
        Organization,
        "name" | "role" | "roleKey" | "roleLabel" | "actions"
    > | null,
    says: Says,
): ReactNode {
    const needs = says.back?.needs;
    const back =
        says.back && (!needs || canOrUnknown(organization, needs))
            ? says.back
            : undefined;
    return (
        <AccessDenied
            {...whoCanChange({
                thing: says.thing,
                business: organization?.name,
                role: organization ? knownRoleName(organization) : null,
                ownerOnly: says.ownerOnly,
            })}
            backHref={back?.href}
            backLabel={back?.label}
        />
    );
}

export async function requireCan(
    action: string | readonly string[],
    says: Says,
    /** Pass the organization when the page has already read it. */
    known?: Organization | null,
): Promise<Access> {
    const organization =
        known === undefined ? await resolveActiveOrganization() : known;
    const held = organization?.actions;
    return {
        organization,
        may: (a) => held?.includes(a) ?? false,
        denied: canOrUnknown(organization, action)
            ? null
            : deniedFor(organization, says),
    };
}
