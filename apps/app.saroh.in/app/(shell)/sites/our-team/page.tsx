import { redirect } from "next/navigation";

import { getTeamPage } from "@/lib/sites/service";

/**
 * Bookings' "Change in Website" (ER3Team T4): straight to the page holding
 * Our team, its People list in the editor; the Website list when there is
 * none.
 */
export default async function OurTeamPage() {
    const at = await getTeamPage();
    redirect(
        at
            ? `/sites/${encodeURIComponent(at.siteId)}?page=${encodeURIComponent(at.pageId)}`
            : "/sites",
    );
}
