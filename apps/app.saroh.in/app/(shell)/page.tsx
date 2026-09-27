import { PageHeader } from "@saroh/ui/page-header";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { HomeSetup } from "@/components/home/home-dashboard";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { PageContainer } from "@/components/shared/page-container";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import { getHome } from "@/lib/home/service";
import { listModules } from "@/lib/modules/service";
import type { Organization } from "@/lib/organizations/service";
import {
    listOrganizations,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { requireSession } from "@/lib/session";
import { loadReadyChecklist } from "@/lib/settings/ready-service";

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

    // Reachable in several businesses and none of them chosen yet — ask,
    // rather than opening whichever one the list happened to return first.
    //
    // The RAW cookie, not `getActiveOrgId`: that resolver deliberately falls
    // back to the first membership so org-scoped calls always have a tenant,
    // which is right for data and useless as a question. What is being asked
    // here is whether the person has ever chosen, and the only record of that
    // is the cookie being written. Writing it is also what stops the question
    // repeating on the way back in.
    const chosen = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
    if (organizations.length > 1 && !chosen) redirect("/choose");

    const [home, business] = await Promise.all([
        getHome(),
        resolveActiveOrganization(organizations),
    ]);
    // A business with nothing on is asked what it wants to do first, and the
    // question needs to know what may be turned on and by whom. Everyone
    // else never pays for the read.
    const modules = home.hasAnyModule ? null : await listModules();
    const setup = home.hasAnyModule ? await loadSetup(business) : null;

    return (
        // A dashboard, so the width matches the other data screens rather than
        // the old reading measure — the schedule column needs room to sit
        // beside the work instead of below it.
        <PageContainer width="full">
            <PageHeader
                title="Home"
                description="What needs you, what's coming up, and where everything stands."
            />
            <div className="mt-6">
                <HomeDashboard
                    home={home}
                    modules={modules}
                    businessName={business?.name ?? "This business"}
                    setup={setup}
                />
            </div>
        </PageContainer>
    );
}

/**
 * "Get ready to take money" (F8): for owners and admins only (`org:update`),
 * whose steps they are. Best-effort — a settings read that fails leaves the
 * checklist off Home, never Home itself.
 */
async function loadSetup(
    business: Organization | null,
): Promise<HomeSetup | null> {
    const may = business?.actions
        ? business.actions.includes("org:update")
        : business?.role === "OWNER" || business?.role === "ADMIN";
    if (!business || !may) return null;
    const settings = await getOrganizationSettings().catch(() => null);
    if (!settings) return null;
    return {
        list: await loadReadyChecklist(settings),
        businessId: settings.id,
    };
}
