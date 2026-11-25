import { redirect } from "next/navigation";

import { navCan } from "@/components/shared/navigation/nav-items";
import { AllSitesScreen } from "@/components/sites/all-sites/all-sites-screen";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Website" };

/**
 * Website, from the rail.
 *
 * With the Website area on (plan 2026-11-18-001 U3) it is All sites, never
 * a redirect, read in the browser (DEC-259). Off, a business with a site
 * is sent straight to its Pages, which sends a reader on to Review — the
 * one redirect decides for every role — and a business with none is shown
 * the way to make one.
 */
export default async function SitesPage() {
    await requireSession();
    const [organization, area] = await Promise.all([
        resolveActiveOrganization(),
        websiteAreaOn(),
    ]);
    if (!area) {
        const first = (await listSites()).at(0);
        if (first) redirect(`/sites/${first.id}/pages`);
    }
    const role = organization?.role ?? null;
    return (
        <AllSitesScreen
            // By what the role was given, never by its name: a role the
            // business made with `site:create` ticked may make one.
            mayCreate={navCan(
                { role, actions: organization?.actions },
                "site:create",
            )}
            reviewer={role === "REVIEWER"}
        />
    );
}
