import { redirect } from "next/navigation";

import { InvitationProblemView } from "@/components/organizations/team/invitation-problem";
import {
    invitationProblem,
    LOCATION_WRONG_EMAIL,
} from "@/lib/invitations/outcome";
import { acceptInvitation } from "@/lib/members/service";
import { joinDoor, locationArrival } from "@/lib/organizations/joined";
import { requireSession } from "@/lib/session";

/**
 * Accept a location's invitation. Requires a session (requireSession bounces
 * a signed-out visitor to accounts sign-in, which brings them back here).
 * The api enforces that the session email matches the invited email. On
 * success they arrive in the location's business, on its orders, and are told
 * where they are. Otherwise the page says which kind
 * of failure it was and the way on (`lib/invitations/outcome.ts`).
 */
export const metadata = { title: "Join a location" };

export default async function AcceptInvitationPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const session = await requireSession();

    const result = await acceptInvitation(token);
    if (result.ok) {
        // Orders for that location, which their menu lists (the location's
        // own settings, where this used to land, it never shows).
        const to = locationArrival(result.data.storeId);
        // Through the workspace's door: it opens the location's business,
        // which this never did, so someone with a business of their own
        // landed in that one. It also leaves the line that says which
        // business they joined and as what.
        redirect(
            result.data.organizationId
                ? joinDoor(result.data.organizationId, to)
                : to,
        );
    }

    return (
        <InvitationProblemView
            // This accept answers 403 for two reasons, and only one of them
            // is the wrong account: its sentence tells them apart.
            problem={invitationProblem(
                result.status,
                result.error === LOCATION_WRONG_EMAIL,
            )}
            refusal={result.error}
            signedInEmail={session.user.email}
            retryHref={`/invitations/${token}`}
        />
    );
}
