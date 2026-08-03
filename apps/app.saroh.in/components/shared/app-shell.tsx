import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";

import { AppHeader } from "@/components/shared/app-header";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { CommandMenu } from "@/components/shared/command-menu";
import { listModules } from "@/lib/modules/service";
import { unreadNotificationCount } from "@/lib/notifications/service";
import {
    listOrganizations,
    resolveActiveOrganization,
} from "@/lib/organizations/service";

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
    const unread = await unreadNotificationCount();

    // Capability-aware chrome (ADR-003): fetch effective module availability
    // once here and pass the available keys (serializable strings — icons are
    // client refs and can't cross the boundary) to the nav so it reflects the
    // Organization's enabled modules.
    //
    // `null` on failure, NOT `[]`: the two mean different things to
    // `filterNavGroups`. A failed fetch is "we don't know" and must fail open so
    // a transient API error never blanks the shell; a successful fetch that
    // returns nothing is "nothing is enabled yet", which a new Organization
    // should see reflected in its nav rather than papered over.
    const moduleKeys = await listModules()
        .then((modules) =>
            modules.filter((m) => m.readiness !== "DISABLED").map((m) => m.key),
        )
        .catch(() => null);

    return (
        <div className="flex min-h-screen">
            <CommandMenu moduleKeys={moduleKeys} />
            <AppSidebar unread={unread} moduleKeys={moduleKeys} />
            <div className="flex min-w-0 flex-1 flex-col">
                <AppHeader
                    user={session.user}
                    organizations={organizations}
                    activeOrg={activeOrg}
                    unread={unread}
                    moduleKeys={moduleKeys}
                />
                {children}
            </div>
        </div>
    );
}
