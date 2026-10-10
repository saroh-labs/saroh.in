import { redirect } from "next/navigation";

import { InvitationProblemView } from "@/components/organizations/invitation-problem";
import {
    invitationProblem,
    LOCATION_WRONG_EMAIL,
} from "@/lib/invitations/outcome";
import { acceptInvitation } from "@/lib/members/service";
import { requireSession } from "@/lib/session";
import { storefrontHref } from "@/lib/stores/links";

/**
 * Accept a location's invitation. Requires a session (requireSession bounces
 * a signed-out visitor to accounts sign-in, which brings them back here).
 * The api enforces that the session email matches the invited email. On
 * success we redirect into the location, otherwise the page says which kind
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
        redirect(storefrontHref(result.data.storeId));
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
