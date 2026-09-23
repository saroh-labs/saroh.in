import { Badge } from "@saroh/ui/badge";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { ConsoleDrawer } from "@/components/console-drawer";
import { ConsoleRail } from "@/components/console-rail";
import { SignOutButton } from "@/components/sign-out-button";
import type { StaffIdentity } from "@/lib/control-plane";
import { INSTANCE_HOST } from "@/lib/control-plane";

/**
 * Chrome for the console.
 *
 * It reuses the workspace's own parts — the rail at its three widths, the
 * shared tokens, `PageHeader` on every screen — and is still unmistakably not
 * a merchant surface, because it is dark by default and says what it is in the
 * bar: the instance, and who you are on it
 * (`docs/product-transformation/information-architecture.md`, and the plan's
 * D7). Before this it was a top bar with no rail and no dark mode at all,
 * which read as unfinished rather than as deliberately different.
 */
export function AdminShell({
    staff,
    children,
}: {
    staff: StaffIdentity;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
                <ConsoleDrawer permissions={staff.permissions} />
                <Link href="/" className="shrink-0">
                    <Wordmark suffix="console" />
                </Link>
                {/*
                 * Which instance this is. On a self-hosted copy it is the
                 * operator's own host, which is the whole point: the console
                 * belongs to the instance it runs on, not to Saroh.
                 */}
                <span className="hidden min-w-0 truncate font-mono text-[12px] text-muted-foreground sm:block">
                    {INSTANCE_HOST}
                </span>
                <div className="ml-auto flex min-w-0 items-center gap-3">
                    <p className="hidden min-w-0 truncate text-[12px] text-muted-foreground md:block">
                        {staff.email}
                        <span aria-hidden> · </span>
                        <span className="sr-only">, </span>
                        {staff.roles.map(formatRole).join(" · ")}
                    </p>
                    <SignOutButton />
                </div>
            </header>

            {staff.viaBootstrap && (
                <div className="border-b border-warning/30 bg-warning-subtle px-4 py-2.5">
                    <div className="flex items-center gap-2.5 text-sm text-warning-subtle-foreground">
                        <Badge variant="outline" className="shrink-0">
                            Break-glass
                        </Badge>
                        <p>
                            You are here via the <code>ADMIN_ALLOWLIST</code>{" "}
                            path, not a recorded grant. Add a PlatformAdmin
                            grant so staff access is revocable and attributable.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                <ConsoleRail permissions={staff.permissions} />
                {/* The work area steps up from the ground in dark, which is
                    the design system's rule read in the console's direction.
                    Not a <main>: each screen's `PageContainer` is that. */}
                <div className="min-w-0 flex-1 bg-card/40">{children}</div>
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
