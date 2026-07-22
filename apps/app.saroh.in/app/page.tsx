import { PageHeader } from "@saroh/ui/page-header";
import { redirect } from "next/navigation";

import { HomeDashboard } from "@/components/home/home-dashboard";
import { getHome } from "@/lib/home/service";
import { listOrganizations } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Action-oriented Home (#119). Answers "where am I / what should I do next"
 * instead of listing stores. The ranked next-actions come from one aggregated
 * api.saroh.in call that already respects the actor's role and enabled modules.
 * Global chrome (brand, switchers, nav) lives in AppHeader via the root layout.
 */
export default async function Home() {
    await requireSession();

    // Zero-org funnel: a signed-in user with no organization onboards first.
    const organizations = await listOrganizations();
    if (organizations.length === 0) redirect("/onboarding");

    const home = await getHome();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title="Home"
                description="Your next best actions across the modules you use."
            />
            <HomeDashboard home={home} />
        </main>
    );
}
