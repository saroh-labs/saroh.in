import { SiteSettingsScreen } from "@/components/sites/settings/site-settings-screen";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Settings · Website" };

/**
 * Website settings (#188), grouped after the Website › Settings audit:
 * what's left before the site is worth sharing, then Address, Search and
 * sharing, Menu and footer, Shop, Tracking and Advanced.
 *
 * Most rows are draft state and reach the public with the next publish,
 * like a section edit; they carry "Next publish". The address, the domain,
 * where the shop sells from, the codes and trackers (DEC-108) and
 * publishing approval apply as soon as they're saved. On React Query
 * (DEC-259): the settings load in the browser; a site that isn't this
 * business's is the not-found page, as before.
 */
export default async function SiteSettingsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    return <SiteSettingsScreen siteId={siteId} />;
}
