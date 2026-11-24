import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HomeContainer } from "@/components/home/home-container";
import {
    homeNewFor,
    homeNewModuleKeys,
} from "@/components/shared/navigation/quick-actions";
import { PageContainer } from "@/components/shared/page/page-container";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import {
    homeModules,
    homeServer,
    homeSetupServer,
    maySeeSetup,
} from "@/lib/home/access";
import type { InvoiceJobFacts } from "@/lib/home/first-run";
import { mayWriteInvoices } from "@/lib/home/first-run";
import { homeRead, homeSetupRead } from "@/lib/home/queries";
import { hasAnyInvoice } from "@/lib/invoices/service";
import { listModules } from "@/lib/modules/service";
import { homeMoment, homeNewFeature } from "@/lib/moments/read";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { firstRunOrder, INVOICE_JOB, kindOf } from "@/lib/organizations/kind";
import { permits } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";
import {
    organizationsOnce,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { requireSession } from "@/lib/session";
import { firstStepsLead } from "@/lib/settings/ready";

/** It had none: Home's tab read the bare "Saroh" (12 Oct 2026). */
export const metadata = { title: "Home" };

/** On React Query: never cached, read per request (DEC-259). */
export const dynamic = "force-dynamic";

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

    // Every business paused for them: the shell says so instead (#800).
    const business = await resolveActiveOrganization(organizations);
    if (!business) return null;

    // Home is read through React Query (DEC-259): prefetched here, read by
    // the container from the hydrated cache. Awaited, since which Home this
    // is (Reviewer, staff, the business's) and what else to read follow it.
    const client = getServerQueryClient();
    const showSetup = await maySeeSetup();
    await prefetchRead(client, homeServer, business.id, {});
    const home = client.getQueryData(
        homeRead.options(business.id, {}).queryKey,
    );
    // Home unread is the page's failure, as before.
    if (!home) {
        throw (
            client.getQueryState(homeRead.key(business.id, {}))?.error ??
            new Error("Home couldn't be read")
        );
    }
    const hydrate = (body: React.ReactNode) => (
        <PageContainer width="full">
            <HydrationBoundary state={dehydrate(client)}>
                {body}
            </HydrationBoundary>
        </PageContainer>
    );
    const name = session.user.name;
    const businessName = business.name;

    // A Reviewer's Home (F9): the greeting and what was sent to them for
    // review — nothing about the business, so nothing else is read.
    if (home.view === "reviewer") {
        return hydrate(
            <HomeContainer
                name={name}
                businessName={businessName}
                kind={kindOf(business.kind)}
                newMenu={{ items: [], roleLine: null }}
                modules={null}
                setupShown={false}
                insights={false}
                moment={null}
                news={null}
            />,
        );
    }

    // What is turned on, read once: New offers only what the business does
    // (a failed read leaves that to the permissions alone), and a business
    // with nothing on is asked what it wants to do first, which needs to
    // know what may be turned on and by whom.
    const allModules = await homeModules();
    const modules = home.hasAnyModule
        ? null
        : (allModules ?? (await listModules()));
    // New (DEC-171, A17): by the permissions the API resolved for this
    // person, never by their role's name.
    const newMenu = homeNewFor({
        moduleKeys: allModules ? homeNewModuleKeys(allModules) : null,
        actions: business.actions,
    });

    // A staff member's Home (F11): their storefronts and their own diary,
    // each part as their role allows. No setup checklist to read.
    if (home.view === "staff") {
        return hydrate(
            <HomeContainer
                name={name}
                businessName={businessName}
                kind={kindOf(business.kind)}
                newMenu={newMenu}
                modules={modules}
                setupShown={false}
                insights={false}
                moment={
                    home.hasAnyModule && home.unavailable.length === 0
                        ? await homeNewFeature(business)
                        : null
                }
                news={null}
            />,
        );
    }

    // "Finish setup" (F8), for owners and admins (`access.ts`): read with
    // Home's queries, so a step done on Home ticks without a reload.
    const withSetup = showSetup && home.hasAnyModule;
    if (withSetup) await prefetchRead(client, homeSetupServer, business.id, {});
    const setup = withSetup
        ? (client.getQueryData(
              homeSetupRead.options(business.id, {}).queryKey,
          ) ?? null)
        : null;
    // What is being set up (DEC-070) orders and words the first-run jobs.
    const kind = kindOf(business.kind);
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
    // The first order or booking, in its first day (wave G), said once,
    // above the work. Else one new feature (release visibility U14), only
    // while nothing else holds the slot: a part that couldn't load, or
    // Finish setup while it leads. It sits under the work as one line
    // (HPHomeDesk) and waits while an order is over 3 days late. One
    // message at a time, never stacked.
    const moment = home.hasAnyModule ? await homeMoment(home, business) : null;
    const news =
        home.hasAnyModule &&
        !moment &&
        home.unavailable.length === 0 &&
        !(setup && firstStepsLead(setup.first))
            ? await homeNewFeature(business)
            : null;

    // A dashboard, so the width matches the other data screens rather than
    // the old reading measure — the schedule column needs room to sit
    // beside the work instead of below it. The greeting is the page's
    // title (F6): who, when, and the last 24 hours, then the work.
    return hydrate(
        <HomeContainer
            name={name}
            businessName={businessName}
            kind={kind}
            newMenu={newMenu}
            modules={modules}
            setupShown={withSetup}
            invoicing={invoicing}
            insights={insights}
            moment={moment}
            news={news}
        />,
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
