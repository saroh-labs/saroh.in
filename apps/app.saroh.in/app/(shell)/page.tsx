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
        // A dashboard, so the width matches the other data screens rather than
        // the old reading measure — the schedule column needs room to sit
        // beside the work instead of below it.
        <main className="mx-auto w-full max-w-7xl p-6 sm:p-8">
            <PageHeader
                title="Home"
                description="What needs you, what's coming up, and where everything stands."
            />
            <div className="mt-6">
                <HomeDashboard home={home} />
            </div>
        </main>
    );
}
