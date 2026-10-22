import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { HomeSetup } from "@/components/home/home-dashboard";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { HomeHeader } from "@/components/home/home-header";
import { NewSpace } from "@/components/home/new-sheet";
import { ReviewerHome } from "@/components/home/reviewer-home";
import { StaffHome } from "@/components/home/staff-home";
import {
    homeNewFor,
    homeNewModuleKeys,
} from "@/components/shared/navigation/quick-actions";
import { Moment } from "@/components/shared/notices/moment";
import { PageContainer } from "@/components/shared/page/page-container";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import type { InvoiceJobFacts } from "@/lib/home/first-run";
import { mayWriteInvoices } from "@/lib/home/first-run";
import { getHome } from "@/lib/home/service";
import { hasAnyInvoice } from "@/lib/invoices/service";
import { listModules } from "@/lib/modules/service";
import { homeMoment } from "@/lib/moments/read";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { firstRunOrder, INVOICE_JOB, kindOf } from "@/lib/organizations/kind";
import { permits } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";
import {
    organizationsOnce,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { requireSession } from "@/lib/session";
import { checklistSubject } from "@/lib/settings/ready";
import { loadReadyChecklist } from "@/lib/settings/ready-service";

/** It had none: Home's tab read the bare "Saroh" (12 Oct 2026). */
export const metadata = { title: "Home" };

/**
 * Action-oriented Home (#119). Answers "where am I / what should I do next"
 * instead of listing stores. The ranked next-actions come from one aggregated
 * api.saroh.in call that already respects the actor's role and enabled modules.
 * Global chrome (brand, switchers, nav) lives in AppHeader via the root layout.
 */
export default async function Home() {
    const session = await requireSession();

    // Zero-org funnel: a signed-in user with no organization onboards first.
    // The shell's own read of the list (one call for the request).
    const organizations = await organizationsOnce();
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

    // A Reviewer's Home (F9): the greeting and what was sent to them for
    // review — nothing about the business, so nothing else is read.
    if (home.view === "reviewer") {
        return (
            <PageContainer width="full">
                <HomeHeader
                    lastDay={home.lastDay}
                    name={session.user.name}
                    businessName={business?.name ?? "This business"}
                />
                <div className="mt-5">
                    <ReviewerHome home={home} />
                </div>
            </PageContainer>
        );
    }

    // What is turned on, read once: New offers only what the business does
    // (a failed read leaves that to the permissions alone), and a business
    // with nothing on is asked what it wants to do first, which needs to
    // know what may be turned on and by whom.
    const allModules = await listModules().catch(() => null);
    const modules = home.hasAnyModule
        ? null
        : (allModules ?? (await listModules()));
    // New (DEC-171, A17): by the permissions the API resolved for this
    // person, never by their role's name.
    const newMenu = homeNewFor({
        moduleKeys: allModules ? homeNewModuleKeys(allModules) : null,
        actions: business?.actions,
    });

    // A staff member's Home (F11): their storefronts and their own diary,
    // each part as their role allows. No setup checklist to read.
    if (home.view === "staff") {
        return (
            <PageContainer width="full">
                <StaffHome
                    home={home}
                    modules={modules}
                    name={session.user.name}
                    businessName={business?.name ?? "This business"}
                    newMenu={newMenu}
                />
            </PageContainer>
        );
    }

    const setup = home.hasAnyModule ? await loadSetup(business) : null;
    // What is being set up (DEC-070) orders and words the first-run jobs.
    const kind = kindOf(business?.kind);
    const invoicing = home.hasAnyModule
        ? undefined
        : await loadInvoicing(business, kind);
    // "See how the month went" (DEC-171): for someone Insights is open to,
    // while the business has it on (a failed module read leaves that to
    // the permission).
    const insights =
        permits(business, "analytics:read") &&
        (allModules === null ||
            allModules.some(
                (m) => m.key === "INSIGHTS" && m.readiness !== "DISABLED",
            ));
    // The first order or booking, in its first day (wave G), said once.
    const moment = home.hasAnyModule ? await homeMoment(home, business) : null;

    return (
        // A dashboard, so the width matches the other data screens rather than
        // the old reading measure — the schedule column needs room to sit
        // beside the work instead of below it.
        <PageContainer width="full">
            {/* The greeting is the page's title (F6): who, when, and the
                last 24 hours, then the work. */}
            <HomeHeader
                lastDay={home.lastDay}
                name={session.user.name}
                businessName={business?.name ?? "This business"}
                kind={kind}
                // The line under the greeting follows the checklist below.
                subject={setup ? checklistSubject(setup.list) : null}
                newMenu={newMenu}
                // The phone Home says it in the day sheet (U17).
                sinceOnPhone={!home.hasAnyModule}
            />
            {moment ? <Moment moment={moment} className="mt-5" /> : null}
            <div className="mt-5">
                <HomeDashboard
                    home={home}
                    modules={modules}
                    businessName={business?.name ?? "This business"}
                    setup={setup}
                    kind={kind}
                    invoicing={invoicing}
                    insights={insights}
                />
            </div>
            {newMenu.items.length > 0 ? <NewSpace /> : null}
        </PageContainer>
    );
}

/**
 * "Invoice a client" (DEC-070), for a kind whose first run offers it: to
 * someone who may write invoices, until the business has one. The invoice
 * read happens only then, and a read that fails leaves the card offered.
 */
async function loadInvoicing(
    business: Organization | null,
    kind: OrganizationKind,
): Promise<InvoiceJobFacts | undefined> {
    if (!firstRunOrder(kind).includes(INVOICE_JOB)) return undefined;
    if (!mayWriteInvoices(business))
        return { mayWrite: false, hasInvoice: null };
    return { mayWrite: true, hasInvoice: await hasAnyInvoice() };
}

/**
 * "Finish setup" (F8): for owners and admins only (`org:update`),
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
