import { SiteVersionsContainer } from "@/components/sites/area/site-screens";
import { requireSession } from "@/lib/session";
import { restoresAsDraft } from "@/lib/sites/website-area-switch";

/**
 * Version history (#194).
 *
 * Every publish has been kept since Stage 2 — `Publication` is immutable and
 * append-only, so republishing inserts a row rather than replacing one. The
 * history existed and had no surface; this is the surface. On React Query
 * (DEC-259): the page awaits its gates (the session, which restore this
 * is); the versions load in the browser.
 */
export const metadata = { title: "Version history · Website" };

export default async function SiteVersionsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    return (
        <SiteVersionsContainer
            siteId={siteId}
            asDraft={await restoresAsDraft()}
        />
    );
}
