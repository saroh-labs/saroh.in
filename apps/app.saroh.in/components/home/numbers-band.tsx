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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {numbers.map((n, index) => (
                <Link
                    key={n.key}
                    href={n.href}
                    style={{ "--wk-i": index } as React.CSSProperties}
                    className="wk-item wk-surface group rounded-md border border-border bg-card px-4 py-3 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="flex items-center justify-between gap-2">
                        <span className="text-2xl font-semibold tabular-nums leading-none">
                            {formatCount(n.value)}
                        </span>
                        <ArrowUpRight className="size-3.5 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                    </span>
                    <span className="mt-1.5 block truncate text-xs text-muted-foreground">
                        {n.label}
                    </span>
                </Link>
            ))}
        </div>
    );
}
