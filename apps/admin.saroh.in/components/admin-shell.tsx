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
            <header className="border-b px-4 sm:px-6">
                <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-7 gap-y-3">
                        <Link
                            href="/"
                            className="shrink-0 font-semibold tracking-tight"
                        >
                            Saroh{" "}
                            <span className="font-normal text-muted-foreground">
                                control
                            </span>
                        </Link>
                        <nav
                            aria-label="Control plane"
                            className="flex items-center gap-1"
                        >
                            {visibleNavigation.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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
                <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100 sm:px-6">
                    You are here via the <code>ADMIN_ALLOWLIST</code>{" "}
                    break-glass path, not a recorded grant. Add a PlatformAdmin
                    grant so staff access is revocable and attributable.
                </p>
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
