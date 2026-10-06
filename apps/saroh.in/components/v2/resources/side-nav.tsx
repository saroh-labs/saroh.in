"use client";

import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface SideNavGroup {
    title: string;
    items: { name: string; href: string }[];
}

/**
 * A Resources section's own nav (plan U1, R1): its topics down the side
 * from 900px; below that, a "Topics" button that opens the same list in
 * place. The page you're on is marked and is not a link (no self-links).
 *
 * From 900px the nav itself is sticky (a sticky child of a box its own
 * height never moves), so it stays in view while the page scrolls; a list
 * taller than the window scrolls inside it.
 */
export function SideNav({
    label,
    groups,
}: {
    /** What the list is, for screen readers: "Help topics". */
    label: string;
    groups: SideNavGroup[];
}) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // A new page closes the phone's list (adjusted while rendering).
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(false);
    }

    return (
        <nav
            aria-label={label}
            className="min-w-0 min-[900px]:sticky min-[900px]:top-6 min-[900px]:max-h-[calc(100dvh-3rem)] min-[900px]:overflow-y-auto min-[900px]:overscroll-contain min-[900px]:pb-6"
        >
            <button
                type="button"
                aria-expanded={open}
                aria-controls="resource-topics"
                onClick={() => setOpen(!open)}
                className="flex h-11 w-full cursor-pointer items-center justify-between rounded-mk-control border border-border-strong bg-card px-3.5 text-[15px] font-semibold text-foreground transition-colors duration-fast ease-out hover:bg-mk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-mk-line-soft min-[900px]:hidden"
            >
                Topics
                <ChevronDown
                    aria-hidden
                    data-chevron
                    strokeWidth={2.25}
                    className={cn(
                        "size-4 text-muted-foreground transition-transform duration-fast ease-out motion-reduce:transition-none",
                        open && "rotate-180",
                    )}
                />
            </button>
            <div
                id="resource-topics"
                className={cn(
                    open ? "grid" : "hidden",
                    "gap-5 pt-3 min-[900px]:grid min-[900px]:pt-0",
                )}
            >
                {groups.map((group) => (
                    <div key={group.title} className="grid gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {group.title}
                        </span>
                        <ul className="m-0 grid list-none gap-0.5 p-0">
                            {group.items.map((item) => (
                                <li key={item.href}>
                                    {item.href === pathname ? (
                                        <span
                                            aria-current="page"
                                            className="block rounded-[8px] bg-card px-2.5 py-1.5 text-[14.5px] font-semibold text-foreground"
                                        >
                                            {item.name}
                                        </span>
                                    ) : (
                                        <Link
                                            href={item.href}
                                            className="block cursor-pointer rounded-[8px] px-2.5 py-1.5 text-[14.5px] text-mk-copy no-underline transition-colors duration-fast ease-out hover:bg-mk-hover hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-mk-line-soft"
                                        >
                                            {item.name}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </nav>
    );
}
