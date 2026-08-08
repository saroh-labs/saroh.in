import { Badge } from "@saroh/ui/badge";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import type { StaffIdentity } from "@/lib/control-plane";

const NAV = [
    { href: "/", label: "Dashboard" },
    { href: "/flags", label: "Releases", permission: "flags:read" },
    { href: "/audit", label: "Audit", permission: "audit:read" },
] as const;

/**
 * Chrome for the control plane. Deliberately plainer than app.saroh.in's shell:
 * this is an internal operations surface, and the visual distance from the
 * tenant product is a feature — an operator should never be unsure which of the
 * two they are looking at.
 */
export function AdminShell({
    staff,
    children,
}: {
    staff: StaffIdentity;
    children: React.ReactNode;
}) {
    const visibleNavigation = NAV.filter(
        (item) =>
            !("permission" in item) ||
            staff.permissions.includes(item.permission),
    );

    return (
        <div className="min-h-screen">
            {/* A thin brand rule across the top: the cheapest possible signal
                that this is the control plane and not a tenant workspace. */}
            <div className="h-1 w-full bg-brand-surface" aria-hidden />
            <header className="border-b bg-card px-4 sm:px-6">
                <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-7 gap-y-3">
                        <Link href="/" className="shrink-0">
                            <Wordmark suffix="control" />
                        </Link>
                        <nav
                            aria-label="Control plane"
                            className="flex items-center gap-1"
                        >
                            {visibleNavigation.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="hidden min-w-0 text-right sm:block">
                            <p className="truncate text-sm">{staff.email}</p>
                            <p className="truncate text-xs text-muted-foreground">
                                {staff.roles.map(formatRole).join(" · ")}
                            </p>
                        </div>
                        <SignOutButton />
                    </div>
                </div>
            </header>

            {staff.viaBootstrap && (
                <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 sm:px-6">
                    <div className="mx-auto flex max-w-7xl items-center gap-2.5 text-sm text-foreground">
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

            {children}
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
