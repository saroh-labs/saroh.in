import { redirect } from "next/navigation";

import { InvitationProblemView } from "@/components/organizations/team/invitation-problem";
import { inviteLandingFor } from "@/lib/accounts";
import { invitationProblem } from "@/lib/invitations/outcome";
import { joinDoor } from "@/lib/organizations/joined";
import { acceptInvitation, invitedEmail } from "@/lib/organizations/members";
import { requireSession } from "@/lib/session";

/**
 * Accept a business's invitation (#276).
 *
 * `/join/:token`, not `/invitations/:token`: that route belongs to a
 * location's invitations, which are a different thing with a different role
 * vocabulary.
 *
 * `requireSession` first: an invitee who has never used Saroh is sent to the
 * invitation's page on accounts (business, inviter, role, their address),
 * whose two doors carry this URL back through sign-up or sign-in (UX-029).
 *
 * On success the invited business becomes the open one, through the
 * workspace's door (`/open/:id`), and a line says so on arrival. Without that, a
 * person who already had a business of their own would accept an invitation
 * and land back in their old one, with the site they were invited to nowhere
 * in sight.
 *
 * A failure says which kind it is (`lib/invitations/outcome.ts`): the API
 * not answering is not an invitation that is gone, and someone signed in as
 * the wrong person is offered the way to the right account.
 */
export const metadata = { title: "Join a business" };

export default async function JoinPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const path = `/join/${token}`;
    // Behind the middleware's own redirect: signed out, the invitation's
    // page on accounts, never the bare sign-in (UX-029).
    const landing = inviteLandingFor(path) ?? undefined;
    const session = await requireSession(landing);

    const result = await acceptInvitation(token);
    if (!result.ok) {
        const problem = invitationProblem(result.status);
        return (
            <InvitationProblemView
                problem={problem}
                refusal={result.error}
                // Read only when it is needed: the address the invitation
                // was sent to, for "Sign out and use {email}".
                invitedEmail={
                    problem === "wrong-person"
                        ? await invitedEmail(token)
                        : null
                }
                signedInEmail={session.user.email}
                retryHref={path}
                // Signed out, the invitation's own page on accounts is the
                // way in: it names the business and carries the address.
                signInAs={landing}
            />
        );
    }

    // Through the workspace's door, which opens the business they joined (a
    // page can't write the open business while it draws) and leaves the
    // line that says which business it is and as what. Then straight to the
    // site they were asked to look at, when they were asked about one: a
    // reviewer's whole job is on that page.
    redirect(
        joinDoor(
            result.data.organizationId,
            result.data.siteId ? `/sites/${result.data.siteId}` : "/",
        ),
    );
}
