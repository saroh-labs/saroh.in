import { Badge } from "@saroh/ui/badge";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { AppsMenu } from "@/components/apps-menu";
import { ConsoleDrawer } from "@/components/console-drawer";
import { ConsoleRail } from "@/components/console-rail";
import { SignOutButton } from "@/components/sign-out-button";
import type { StaffIdentity } from "@/lib/control-plane";
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
        <div className="flex min-h-screen flex-col">
            {/* Sticky, at a fixed 56px, so the rail can sit exactly below it
                and only the work area moves with the page. */}
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
                <ConsoleDrawer permissions={staff.permissions} />
                <Link href="/" className="shrink-0">
                    <Wordmark suffix="console" />
                </Link>
                <div className="ml-auto flex min-w-0 items-center gap-3">
                    <p className="hidden min-w-0 truncate text-[12px] text-muted-foreground md:block">
                        {staff.email}
                        <span aria-hidden> · </span>
                        <span className="sr-only">, </span>
                        {staff.roles.map(formatRole).join(" · ")}
                    </p>
                    {instance && <AppsMenu instance={instance} />}
                    <SignOutButton />
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <ConsoleRail permissions={staff.permissions} />
                {/* The work area steps up from the ground in dark, which is
                    the design system's rule read in the console's direction.
                    Not a <main>: each screen's `PageContainer` is that. */}
                <div className="min-w-0 flex-1 bg-card/40">
                    {/* In the work area rather than across the top, so the
                        header and rail keep one fixed height to stick at. */}
                    {staff.viaBootstrap && (
                        <div className="border-b border-warning/30 bg-warning-subtle px-4 py-2.5">
                            <div className="flex items-center gap-2.5 text-sm text-warning-subtle-foreground">
                                <Badge variant="outline" className="shrink-0">
                                    Break-glass
                                </Badge>
                                <p>
                                    You are here via the{" "}
                                    <code>ADMIN_ALLOWLIST</code> path, not a
                                    recorded grant. Add a PlatformAdmin grant so
                                    staff access is revocable and attributable.
                                </p>
                            </div>
                        </div>
                    )}
                    {children}
                </div>
            </div>
        </div>
    );
}

function formatRole(role: StaffIdentity["roles"][number]): string {
    return role
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
