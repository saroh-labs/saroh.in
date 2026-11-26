import { ReleaseScreen } from "@/components/sites/test-releases/release-screen";
import { requireSession } from "@/lib/session";

/**
 * One test release, read in the workspace (DEC-071, T12).
 *
 * Reviewers look at a release, not the draft, and approve that. It needs no
 * link token: the session and `site:read` open it, so a reviewer invited to
 * the site reads what they were asked to without anyone forwarding a link.
 * On React Query (DEC-259): the release loads in the browser; one that
 * isn't this site's, or test releases off for the business, is a 404
 * (KTD-16): it is not told the feature exists.
 */
export const metadata = { title: "Test link · Website" };

export default async function TestReleasePage({
    params,
}: {
    params: Promise<{ siteId: string; releaseId: string }>;
}) {
    const { siteId, releaseId } = await params;
    await requireSession();
    return <ReleaseScreen siteId={siteId} releaseId={releaseId} />;
}
