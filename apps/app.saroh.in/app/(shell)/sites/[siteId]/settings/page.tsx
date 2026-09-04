import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteSettings } from "@/components/sites/site-settings";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

/**
 * Website settings (#188) — where the site lives, and what other platforms show
 * about it.
 *
 * Store-level equivalents live under Commerce; this is the site's own record:
 * its address, its search appearance, and the card people see when the link is
 * forwarded. All of it is DRAFT state — it reaches the public only through the
 * next publish, exactly like a section edit.
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
        // Header and content share one measure. Left full-width, the header's
        // action lands at the far edge of the shell while the settings sit in a
        // narrow column — which reads as a stray button and, at this width,
        // clipped off the screen entirely.
        //
        // A <main> with the shell's gutter, like every other page. The shell's
        // own main carries no padding — pages own it — and this one wrapped
        // itself in a bare div, so the heading sat flush against the rail and
        // the top bar while the sites list next door had 32px of air.
        <main className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
            <PageHeader
                title="Website settings"
                description={site.name}
                actions={
                    <Button variant="brand" asChild>
                        <Link href={`/sites/${siteId}`}>Open editor</Link>
                    </Button>
                }
            />
            <SiteSettings site={site} />
        </main>
    );
}
