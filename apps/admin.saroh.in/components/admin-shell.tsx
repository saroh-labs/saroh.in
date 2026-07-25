import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
    { href: "/", label: "Dashboard" },
    { href: "/flags", label: "Feature flags" },
];

/**
 * Chrome for the control plane. Deliberately plainer than app.saroh.in's shell:
 * this is an internal operations surface, and the visual distance from the
 * tenant product is a feature — an operator should never be unsure which of the
 * two they are looking at.
 */
export function AdminShell({
    email,
    viaBootstrap,
    children,
}: {
    email: string;
    viaBootstrap?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen">
            <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
                <div className="flex items-center gap-6">
                    <Link href="/" className="font-semibold">
                        Saroh{" "}
                        <span className="text-muted-foreground">admin</span>
                    </Link>
                    <nav className="flex items-center gap-4">
                        {NAV.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <span className="hidden text-sm text-muted-foreground sm:inline">
                        {email}
                    </span>
                    <SignOutButton />
                </div>
            </header>

            {viaBootstrap && (
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
