import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { ThemeToggle } from "@/components/common/ThemeToggle";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { CommandTrigger } from "@/components/shared/command-trigger";
import { MobileNav } from "@/components/shared/mobile-nav";
import { UserMenu } from "@/components/shared/user-menu";
import type { Organization } from "@/lib/organizations/service";

/**
 * The slim top bar of the app shell. Primary navigation now lives in the
 * `AppSidebar` (desktop) / `MobileNav` (mobile), so this bar only carries
 * identity + session actions: the mobile nav trigger and brand on small
 * screens (the sidebar owns the brand at `lg+`), the org switcher, and
 * sign-out. It is presentational — `AppShell` fetches session/org/unread ONCE
 * and passes them in, so the session is never fetched twice per request.
 */
/** The signed-in user, for the identity menu. */
export interface HeaderUser {
    name?: string | null;
    email: string;
}

type AppHeaderProps =
    | { onboarding: true; user: HeaderUser }
    | {
          onboarding?: false;
          user: HeaderUser;
          organizations: Organization[];
          activeOrg: Organization | null;
          unread: number;
          /** `null` = availability unknown; see `filterNavGroups`. */
          moduleKeys: string[] | null;
      };

export function AppHeader(props: AppHeaderProps) {
    // Zero-org onboarding: no switcher/nav yet — brand + identity menu only.
    // The menu still appears (you must be able to see which account you are
    // completing onboarding as), minus the org-settings link, which has no
    // meaning before an org exists.
    if (props.onboarding) {
        return (
            <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
                <UserMenu
                    name={props.user.name}
                    email={props.user.email}
                    showOrganizationSettings={false}
                />
            </header>
        );
    }

    const { organizations, activeOrg, unread, moduleKeys, user } = props;

    return (
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
                <MobileNav unread={unread} moduleKeys={moduleKeys} />
                <Link
                    href="/"
                    aria-label="Saroh"
                    className="shrink-0 lg:hidden"
                >
                    <Wordmark />
                </Link>
                <CommandTrigger />
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
                {activeOrg && (
                    <OrganizationSwitcher
                        organizations={organizations}
                        activeOrgId={activeOrg.id}
                    />
                )}
                <ThemeToggle />
                <UserMenu name={user.name} email={user.email} />
            </div>
        </header>
    );
}
