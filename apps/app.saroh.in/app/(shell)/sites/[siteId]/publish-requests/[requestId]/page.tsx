import { PublishRequestContainer } from "@/components/sites/area/site-screens";
import { requireSession } from "@/lib/session";

/**
 * Where an AI app's publish request is answered (DEC-215 as amended 12 Nov
 * 2026). The app's link opens the business (`/open/:id?to=`) and lands
 * here. Reading never publishes: only the signed-in person's press does.
 * A 403 (no `site:publish`) is the shell's no-access state; a request that
 * isn't this business's or this site's reads as not here. On React Query
 * (DEC-259): read in the browser.
 */
export const metadata = { title: "Publish request · Website" };

export default async function PublishRequestPage({
    params,
}: {
    params: Promise<{ siteId: string; requestId: string }>;
}) {
    const { siteId, requestId } = await params;
    await requireSession();
    return <PublishRequestContainer siteId={siteId} requestId={requestId} />;
}
