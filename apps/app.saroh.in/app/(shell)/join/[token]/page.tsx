import { EmptyState } from "@saroh/ui/empty-state";
import { redirect } from "next/navigation";

import { setActiveOrganization } from "@/lib/organizations/actions";
import { acceptInvitation } from "@/lib/organizations/members";
import { requireSession } from "@/lib/session";

/**
 * Accept a workspace invitation (#276).
 *
 * `/join/:token`, not `/invitations/:token` — that route belongs to the
 * store-level invites, which are a different thing with a different role
 * vocabulary.
 *
 * `requireSession` first: an invitee who has never used Saroh is sent to sign
 * in or sign up and comes back here, because the sign-in return-to carries the
 * URL they were trying to reach (#222).
 *
 * On success the invited workspace becomes the active one. Without that, a
 * person who already had a workspace of their own would accept an invitation
 * and land back in their old one, with the site they were invited to nowhere
 * in sight.
 */
export const metadata = { title: "Join a workspace" };

export default async function JoinPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    await requireSession();

    const result = await acceptInvitation(token);
    if (!result.ok) {
        return (
            <main className="mx-auto max-w-lg p-8">
                <EmptyState
                    title="This invitation cannot be used"
                    description={result.error}
                />
            </main>
        );
    }

    await setActiveOrganization(result.data.organizationId);
    // Straight to the site they were asked to look at, when they were asked
    // about one. A reviewer's whole job is on that page.
    redirect(result.data.siteId ? `/sites/${result.data.siteId}` : "/");
}
