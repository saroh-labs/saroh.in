import { AccessDenied } from "@/components/shared/access-denied";
import { whoCanChange } from "@/components/shared/who-can-change";
import { knownRoleName } from "@/lib/organizations/role-name";

/**
 * The editor for a role that can't see products (#525), after the Editor
 * design's locked state: why, who can change it, and the way home. No retry
 * — nothing failed.
 */
export function NoProductAccess({
    organization,
}: {
    organization: {
        name: string;
        role?: string | null;
        roleKey?: string | null;
        roleLabel?: string | null;
    };
}) {
    return (
        <AccessDenied
            {...whoCanChange({
                thing: "Products",
                business: organization.name,
                role: knownRoleName(organization),
            })}
        />
    );
}
