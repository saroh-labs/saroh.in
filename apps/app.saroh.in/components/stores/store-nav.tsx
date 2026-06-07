"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Per-store navigation. Active sections (Overview, Settings) are real links;
 * future sections (Content, Products, Members) render disabled with a "Soon"
 * badge so they read as deliberate placeholders, not broken links.
 */
export function StoreNav({ storeId }: { storeId: string }) {
    const pathname = usePathname();
    const base = `/stores/${storeId}`;

    const links = [
        { label: "Overview", href: base, exact: true },
        { label: "Members", href: `${base}/members`, exact: false },
        { label: "Settings", href: `${base}/settings`, exact: false },
    ];

    const comingSoon = ["Content", "Products"];

    const isActive = (href: string, exact: boolean) =>
        exact ? pathname === href : pathname.startsWith(href);

    return (
        <nav
            aria-label="Store sections"
            className="flex flex-wrap items-center gap-1 border-b pb-2"
        >
            {links.map((link) => (
                <Link
                    key={link.href}
                    href={link.href}
                    aria-current={
                        isActive(link.href, link.exact) ? "page" : undefined
                    }
                    className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActive(link.href, link.exact)
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {link.label}
                </Link>
            ))}

            {comingSoon.map((label) => (
                <span
                    key={label}
                    aria-disabled="true"
                    title="Coming soon"
                    className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground/50"
                >
                    {label}
                    <Badge
                        variant="secondary"
                        className="px-1.5 py-0 text-[10px]"
                    >
                        Soon
                    </Badge>
                </span>
            ))}
        </nav>
    );
}
