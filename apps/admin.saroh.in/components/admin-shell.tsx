import { AppsMenu } from "@/components/apps-menu";
import { BreakGlassBanner } from "@/components/break-glass-banner";
import { ConsoleDrawer } from "@/components/console-drawer";
import { ConsoleFrame } from "@/components/console-frame";
import { ConsoleRail } from "@/components/console-rail";
import { ConsoleSearch } from "@/components/console-search";
import { SignOutButton } from "@/components/sign-out-button";
import type { StaffIdentity } from "@/lib/control-plane";
import { ROLE_LABEL } from "@/lib/roles";
import { instanceApps } from "@/lib/sibling-apps";

/**
 * Chrome for the console.
 *
 * It reuses the workspace's own parts — the rail at its three widths, the
 * shared tokens, `PageHeader` on every screen — and is still unmistakably not
 * a merchant surface, because it is dark by default and says what it is in the
 * bar: who you are on it, and — in the apps menu — which instance this is
 * (`docs/product-transformation/information-architecture.md`, and the plan's
 * D7). Before this it was a top bar with no rail and no dark mode at all,
 * which read as unfinished rather than as deliberately different.
 */
export async function AdminShell({
    staff,
    children,
}: {
    staff: StaffIdentity;
    children: React.ReactNode;
}) {
    const instance = await instanceApps();

    return (
        <ConsoleFrame
            drawer={<ConsoleDrawer permissions={staff.permissions} />}
            // Search finds a business, a user or a Razorpay id from any
            // screen (U10, R15).
            search={<ConsoleSearch />}
            account={
                <>
                    <p className="hidden min-w-0 truncate text-[12px] text-muted-foreground md:block">
                        {staff.email}
                        <span aria-hidden> · </span>
                        <span className="sr-only">, </span>
                        {/* Someone in through the allow-list borrows the
                            permissions, not a role on the record (audits
                            M2/F7, 1 Nov). */}
                        {staff.viaBootstrap ? (
                            <span className="text-warning">
                                Emergency access
                            </span>
                        ) : (
                            staff.roles
                                .map((role) => ROLE_LABEL[role])
                                .join(" · ")
                        )}
                    </p>
                    {instance && <AppsMenu instance={instance} />}
                    <SignOutButton />
                </>
            }
            rail={<ConsoleRail permissions={staff.permissions} />}
            banner={staff.viaBootstrap ? <BreakGlassBanner /> : null}
        >
            {children}
        </ConsoleFrame>
    );
}
