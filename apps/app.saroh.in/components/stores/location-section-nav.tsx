"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useState } from "react";

/**
 * The location page's parts, as a list beside them on a wide screen (≥1280px,
 * the 9 Oct audit): The place · Payments · Delivery · Customers · Pause or
 * close, the one in view marked (`aria-current`). It sticks under the app's
 * header as the page scrolls. Narrower, it isn't drawn: the parts are one
 * column and their titles are the way through.
 *
 * Plain `#id` links, so they work before the page is interactive and with
 * no script at all; the marking is the only thing that needs one.
 */
export function LocationSectionNav({
    sections,
}: {
    sections: readonly { id: string; label: string }[];
}) {
    const [current, setCurrent] = useState(sections[0]?.id ?? null);
    const ids = sections.map((s) => s.id).join(" ");

    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return;
        const order = ids.split(" ");
        const seen = new Set<string>();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) seen.add(e.target.id);
                    else seen.delete(e.target.id);
                }
                // The first part, in page order, inside the band under the
                // header; the last one marked stays while none is.
                const first = order.find((id) => seen.has(id));
                if (first) setCurrent(first);
            },
            // A band from just under the sticky header to 40% down.
            { rootMargin: "-72px 0px -60% 0px" },
        );
        for (const id of order) {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        }
        return () => observer.disconnect();
    }, [ids]);

    return (
        <nav
            aria-label="On this page"
            className="sticky top-[77px] hidden w-44 shrink-0 self-start xl:block"
        >
            <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                On this page
            </p>
            <ul className="grid gap-0.5 border-l border-border">
                {sections.map((s) => {
                    const on = s.id === current;
                    return (
                        <li key={s.id}>
                            <a
                                href={`#${s.id}`}
                                aria-current={on ? "location" : undefined}
                                onClick={() => setCurrent(s.id)}
                                className={cn(
                                    "-ml-px flex min-h-8 items-center border-l-2 px-2.5 text-[13px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on
                                        ? "border-foreground font-medium text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground active:text-foreground/80",
                                )}
                            >
                                {s.label}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
