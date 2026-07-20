import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { CommandTrigger } from "@/components/shared/command-trigger";
import { MobileNav } from "@/components/shared/mobile-nav";
import { SignOutButton } from "@/components/sign-out-button";
import type { Organization } from "@/lib/organizations/service";

/**
 * The slim top bar of the app shell. Primary navigation now lives in the
 * `AppSidebar` (desktop) / `MobileNav` (mobile), so this bar only carries
 * identity + session actions: the mobile nav trigger and brand on small
 * screens (the sidebar owns the brand at `lg+`), the org switcher, and
 * sign-out. It is presentational — `AppShell` fetches session/org/unread ONCE
 * and passes them in, so the session is never fetched twice per request.
 */
type AppHeaderProps =
    | { onboarding: true }
    | {
          onboarding?: false;
          organizations: Organization[];
          activeOrg: Organization | null;
          unread: number;
      };

export function AppHeader(props: AppHeaderProps) {
    // Zero-org onboarding: no switcher/nav yet — just the brand + sign-out.
    if (props.onboarding) {
        return (
            <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
                <SignOutButton />
            </header>
        );
    }

    const { organizations, activeOrg, unread } = props;

    return (
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
                <MobileNav unread={unread} />
                <Link
                    href="/"
                    aria-label="Saroh"
                    className="shrink-0 lg:hidden"
                >
                    <Wordmark />
                </Link>
                <CommandTrigger />
            </div>
            <div className="flex items-center gap-4">
                {activeOrg && (
                    <OrganizationSwitcher
                        organizations={organizations}
                        activeOrgId={activeOrg.id}
                    />
                )}
                <SignOutButton />
            </div>
        </header>
    );
}
