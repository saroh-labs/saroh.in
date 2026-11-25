import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HomeContainer } from "@/components/home/home-container";
import {
    homeNewFor,
    homeNewModuleKeys,
} from "@/components/shared/navigation/quick-actions";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";
import { homeModules, maySeeSetup } from "@/lib/home/access";
import { kindOf } from "@/lib/organizations/kind";
import { permits } from "@/lib/organizations/permits";
import {
    organizationsOnce,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

/** It had none: Home's tab read the bare "Saroh" (12 Oct 2026). */
export const metadata = { title: "Home" };

/**
 * Action-oriented Home (#119). Answers "where am I / what should I do next"
 * instead of listing stores. The ranked next-actions come from one aggregated
 * api.saroh.in call that already respects the actor's role and enabled modules.
 * Global chrome (brand, switchers, nav) lives in AppHeader via the root layout.
 *
 * On React Query (DEC-259), loaded in the browser: the page decides only
 * the gates (signed in, a business, chosen, not paused) and what this
 * person may be offered (New, Finish setup, Insights); Home itself, which
 * Home it is and what it says, is `HomeContainer`'s read (`/api/home`),
 * behind the shell's loader until it lands.
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

    // What is turned on, read once (the shell's module gate shares it): New
    // offers only what the business does (a failed read leaves that to the
    // permissions alone), and a business with nothing on is asked what it
    // wants to do first, which needs to know what may be turned on.
    const [showSetup, allModules] = await Promise.all([
        maySeeSetup(),
        homeModules(),
    ]);
    // "See how the month went" (DEC-171): for someone Insights is open to,
    // while the business has it on (a failed module read leaves that to
    // the permission).
    const insights =
        permits(business, "analytics:read") &&
        (allModules === null ||
            allModules.some(
                (m) => m.key === "INSIGHTS" && m.readiness !== "DISABLED",
            ));

    // A dashboard, so the width matches the other data screens rather than
    // the old reading measure — the schedule column needs room to sit
    // beside the work instead of below it. The greeting is the page's
    // title (F6): who, when, and the last 24 hours, then the work.
    return (
        <HomeContainer
            skeleton={<Loading />}
            name={session.user.name}
            businessName={business.name}
            kind={kindOf(business.kind)}
            // New (DEC-171, A17): by the permissions the API resolved for
            // this person, never by their role's name.
            newMenu={homeNewFor({
                moduleKeys: allModules ? homeNewModuleKeys(allModules) : null,
                actions: business.actions,
            })}
            modules={allModules}
            // "Finish setup" (F8), for owners and admins (`access.ts`).
            setupShown={showSetup}
            insights={insights}
        />
    );
}
