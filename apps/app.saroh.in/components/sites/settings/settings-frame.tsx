"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useState } from "react";

/**
 * The settings tab's column and, on a wide screen (1280px and up), the
 * sticky list of its groups beside it, in the width that was empty.
 * Narrower than that the list would crowd the column, so it isn't drawn:
 * the groups follow one another, each with its heading.
 *
 * The list is a `nav` landmark, and the group in view is its
 * `aria-current` entry, followed as the page scrolls.
 */
export function SettingsFrame({
    groups,
    children,
}: {
    groups: readonly { id: string; label: string }[];
    children: React.ReactNode;
}) {
    const current = useGroupInView(groups);
    return (
        <div className="xl:grid xl:grid-cols-[minmax(0,42rem)_13rem] xl:items-start xl:gap-12">
            <div className="min-w-0 max-w-2xl space-y-10">{children}</div>
            <nav
                aria-label="Settings sections"
                className="sticky top-20 hidden xl:block"
            >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    On this page
                </p>
                <ul className="space-y-0.5 border-l border-border">
                    {groups.map((g) => {
                        const on = g.id === current;
                        return (
                            <li key={g.id}>
                                <a
                                    href={`#${g.id}`}
                                    aria-current={on ? "location" : undefined}
                                    className={cn(
                                        "-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                        on
                                            ? "border-foreground font-medium text-foreground"
                                            : "border-transparent text-muted-foreground hover:text-foreground active:text-muted-foreground",
                                    )}
                                >
                                    {g.label}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </div>
    );
}

/**
 * The group nearest the top of the screen: the last one whose heading has
 * passed a line a little below the top. The first until anything scrolls.
 */
function useGroupInView(groups: readonly { id: string }[]): string | null {
    const ids = groups.map((g) => g.id).join(" ");
    const [current, setCurrent] = useState<string | null>(
        groups[0]?.id ?? null,
    );
    useEffect(() => {
        const list = ids.split(" ").filter(Boolean);
        if (typeof IntersectionObserver === "undefined") return;
        const els = list
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => el !== null);
        if (els.length === 0) return;
        const pick = () => {
            const line = 120;
            let seen = list[0] ?? null;
            for (const el of els) {
                if (el.getBoundingClientRect().top - line <= 0) seen = el.id;
            }
            // At the foot of the page the last short group can never reach
            // the line; the bottom says it's the one being read.
            const atFoot =
                window.innerHeight + window.scrollY >=
                document.documentElement.scrollHeight - 2;
            setCurrent(atFoot ? (els[els.length - 1]?.id ?? seen) : seen);
        };
        const observer = new IntersectionObserver(pick, {
            rootMargin: "0px 0px -60% 0px",
            threshold: [0, 1],
        });
        els.forEach((el) => observer.observe(el));
        window.addEventListener("scroll", pick, { passive: true });
        pick();
        return () => {
            observer.disconnect();
            window.removeEventListener("scroll", pick);
        };
    }, [ids]);
    return current;
}
