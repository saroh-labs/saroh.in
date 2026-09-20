import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { formatCount } from "@/lib/format/money";
import type { HomeNumber } from "@/lib/home/service";

/**
 * Counts that are doors.
 *
 * The rule the plan sets and this enforces: *never a decorative tile*. Every
 * number here is a link to exactly the rows it counts — "Open leads" lands on
 * Leads with the open filter already applied, not on the unfiltered list for
 * the merchant to narrow by hand. A stat that cannot be opened is a poster.
 *
 * The API only emits a number for a module the actor can see, so this renders
 * whatever it is handed without needing its own gating — and cannot drift from
 * the gating the rest of the shell uses.
 */
export function NumbersBand({ numbers }: { numbers: HomeNumber[] }) {
    if (numbers.length === 0) return null;

    return (
        // Tiles from 178px up, as the workspace design lays them out.
        <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
            {numbers.map((n, index) => (
                <Link
                    key={n.key}
                    href={n.href}
                    style={{ "--wk-i": index } as React.CSSProperties}
                    className="wk-item wk-surface group rounded-[11px] border border-border bg-card px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {n.label}
                        </span>
                        {/* The one thing the design's tile does not carry: a
                            number here is a door, so it says so. */}
                        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-fast group-hover:text-foreground" />
                    </span>
                    <span className="mt-[7px] block font-display text-[25px] font-semibold tabular-nums leading-none tracking-[-0.03em]">
                        {formatCount(n.value)}
                    </span>
                </Link>
            ))}
        </div>
    );
}
