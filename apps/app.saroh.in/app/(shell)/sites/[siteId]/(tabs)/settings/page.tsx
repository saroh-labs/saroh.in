import { notFound } from "next/navigation";

import { SiteSettings } from "@/components/sites/site-settings";
import { SiteSettingsRead } from "@/components/sites/site-settings-read";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

export const metadata = { title: "Settings · Website" };

/**
 * Website settings (#188) — where the site lives, and what other platforms show
 * about it.
 *
 * Store-level equivalents live under Commerce; this is the site's own record:
 * its address, its search appearance, and the card people see when the link is
 * forwarded. All of it is DRAFT state — it reaches the public only through the
 * next publish, exactly like a section edit.
 *
 * The Website header above it carries the site's name and the way into the
 * editor, so this tab is only the settings, at a form's measure.
 */
export default async function SiteSettingsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();

    const site = await getSite(siteId);
    if (!site) notFound();

    return (
        <div className="max-w-2xl">
            {site.can.manageSettings ? (
                <SiteSettings site={site} />
            ) : (
                // The values, and none of the controls the API would refuse
                // (#275).
                <SiteSettingsRead site={site} />
            )}
        </div>
    );
}
