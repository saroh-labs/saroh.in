import { AccessDenied } from "@/components/shared/access-denied";
import { noAccessLine, roleName } from "@/lib/products/editor-labels";

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
        roleLabel?: string | null;
    };
}) {
    return (
        <AccessDenied
            title="You can't open this product"
            description={noAccessLine(
                roleName(organization),
                organization.name,
            )}
            note={null}
            backLabel="Go to Home"
        />
    );
}
