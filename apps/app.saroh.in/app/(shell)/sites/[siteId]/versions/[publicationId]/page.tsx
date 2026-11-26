import { SiteVersionScreen } from "@/components/sites/versions/site-version-screen";
import { requireSession } from "@/lib/session";
import { restoresAsDraft } from "@/lib/sites/website-area-switch";

/**
 * One past version, as it was served (#283, #194).
 *
 * #194 shipped the list and restore, and left "preview any past version as it
 * was served" as its remaining half. Restoring blind is the thing that page
 * was meant to spare a merchant: the list names a date, not what the site
 * looked like on it. On React Query (DEC-259): the page awaits its gates
 * (the session, which restore this is); the version loads in the browser.
 */
export const metadata = { title: "Past version · Website" };

export default async function PastVersionPage({
    params,
}: {
    params: Promise<{ siteId: string; publicationId: string }>;
}) {
    const { siteId, publicationId } = await params;
    await requireSession();
    return (
        <SiteVersionScreen
            siteId={siteId}
            publicationId={publicationId}
            asDraft={await restoresAsDraft()}
        />
    );
}
