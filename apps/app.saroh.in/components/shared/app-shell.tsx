import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";

import { AppHeader } from "@/components/shared/app-header";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { CommandMenu } from "@/components/shared/command-menu";
import type { NavCounts } from "@/components/shared/nav-items";
import { getHome } from "@/lib/home/service";
import { listModules } from "@/lib/modules/service";
import { unreadNotificationCount } from "@/lib/notifications/service";
import {
    listOrganizations,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { listSites } from "@/lib/sites/service";

/**
 * The authenticated app shell, rendered once in the root layout. It is the
 * SINGLE server-side fetcher for the chrome — session, org list, active org,
 * and unread count are read here exactly once and passed as props to the
 * (client) `AppSidebar` / `MobileNav` and the presentational `AppHeader`.
 * `getServerSession` is a `no-store` network call, so consolidating the fetch
 * here (instead of each chrome piece fetching) avoids duplicate round-trips.
 *
 * Non-throwing by design: this renders inside the root layout on every page, so
 * it must not redirect. Middleware already gates unauthenticated access; with
 * no session we render the page bare (no chrome).
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(await headers());
    if (!session) return <>{children}</>;

    const organizations = await listOrganizations();

    // Zero-org onboarding: no sidebar yet — just a slim top bar (brand +
    // sign-out) so the funnel stays uncluttered.
    if (organizations.length === 0) {
        return (
            <div className="flex min-h-screen flex-col">
                <AppHeader onboarding user={session.user} />
                {children}
            </div>
        );
    }

    // Reuse the already-fetched list instead of re-fetching it (#102).
    const activeOrg = await resolveActiveOrganization(organizations);

    // Concurrently, because none of the three depends on another. They used to
    // run one after the next, which cost the sum of three round trips on every
    // page in the app rather than the slowest one.
    //
    // Capability-aware chrome (ADR-003): `moduleKeys` is the effective module
    // availability, passed to the nav as serializable strings (icons are client
    // refs and can't cross the boundary).
    //
    // `null` on failure, NOT `[]`: the two mean different things to
    // `filterNavGroups`. A failed fetch is "we don't know" and must fail open so
    // a transient API error never blanks the shell; a successful fetch that
    // returns nothing is "nothing is enabled yet", which a new Organization
    // should see reflected in its nav rather than papered over.
    const [unread, moduleKeys, home, sites] = await Promise.all([
        unreadNotificationCount(),
        listModules()
            .then((modules) =>
                modules
                    .filter((m) => m.readiness !== "DISABLED")
                    .map((m) => m.key),
            )
            .catch(() => null),
        // The rail's work counts come from the same ranked read model Home uses,
        // so the two can never disagree. Non-fatal: a rail without badges is a
        // working rail, and this renders on every page.
        getHome().catch(() => null),
        /*
         * The merchant's own sites, hung under Website in the rail.
         *
         * Non-fatal like the counts: a rail without the tree is still a working
         * rail, and this renders on every screen in the app. It joins the same
         * Promise.all rather than being awaited after, so it costs the slowest
         * of four round trips instead of adding a fifth in series.
         */
        listSites().catch(() => []),
    ]);

    /*
     * Only actions that represent OUTSTANDING WORK become badges.
     *
     * A SETUP or SUGGESTION action is advice, not a queue — badging "Add a
     * product to your catalog" as a 1 next to Sell would train merchants to
     * ignore the badges within a week, which is precisely what makes the count
     * on Leads worth reading when it does appear.
     */
    const counts: NavCounts = Object.fromEntries(
        (home?.actions ?? [])
            .filter((a) => a.severity === "OVERDUE" && (a.count ?? 0) > 0)
            .map((a) => [a.href, a.count]),
    );

    /*
     * Only what the nav needs crosses the boundary. `SiteSummary` carries a
     * publication pointer, a style blob and timestamps; the rail wants a name
     * and an id, and shipping the rest to three client components on every page
     * would be paying for it in the payload on every navigation.
     */
    const navSites = sites.map((site) => ({ id: site.id, name: site.name }));

    return (
        <div className="flex min-h-screen">
            {/*
             * Without this, reaching the page content by keyboard means tabbing
             * through the wordmark, search, every nav item, the org switcher,
             * the theme toggle and the account menu — on every single page.
             * Visible only when focused, so it costs sighted users nothing.
             */}
            <a
                href="#main-content"
                className="sr-only bg-background text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
                Skip to content
            </a>
            <CommandMenu moduleKeys={moduleKeys} sites={navSites} />
            <AppSidebar
                unread={unread}
                moduleKeys={moduleKeys}
                counts={counts}
                sites={navSites}
            />
            <div className="flex min-w-0 flex-1 flex-col">
                <AppHeader
                    user={session.user}
                    organizations={organizations}
                    activeOrg={activeOrg}
                    unread={unread}
                    moduleKeys={moduleKeys}
                    counts={counts}
                    sites={navSites}
                />
                {/*
                 * `tabIndex={-1}` makes this a valid focus target: following the
                 * skip link must MOVE focus, not just scroll, or the next Tab
                 * would land back at the top of the nav.
                 */}
                <div
                    id="main-content"
                    tabIndex={-1}
                    className="flex flex-1 flex-col outline-none"
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
