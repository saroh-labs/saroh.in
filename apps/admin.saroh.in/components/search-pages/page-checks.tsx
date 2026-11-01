"use client";

import type {
    SearchPageCheck,
    SearchPageData,
    ToolPageData,
} from "@saroh/search-pages";
import { searchPageChecks, toolChecks } from "@saroh/search-pages/checks";
import type { DocPage } from "@saroh/search-pages/docs";
import { docPageChecks } from "@saroh/search-pages/docs";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import { Check, CircleAlert, X } from "lucide-react";
import { useMemo } from "react";

type Checks = SearchPageCheck[] | "loading" | "failed";

/** Any search page's words: a /for/ page, a free tool, or a GST page, guide or download. */
export type AnyPageData = SearchPageData | ToolPageData | DocPage;

/**
 * A page's checks, run in a client component: they draw the page with
 * react-dom/server, which Next refuses anywhere on the server graph
 * (Server Components and route handlers alike). `enabled` false runs
 * nothing.
 */
export function useChecks(page: AnyPageData, enabled = true): Checks {
    return useMemo(() => {
        if (!enabled) return "loading";
        try {
            // A free tool's and a GST page's, guide's or download's checks read its file (#1253); a /for/ page's draw it.
            if ("body" in page) return docPageChecks(page);
            return "scene" in page ? searchPageChecks(page) : toolChecks(page);
        } catch {
            return "failed";
        }
    }, [page, enabled]);
}

/** How many checks didn't pass, 0 while they're read or when they couldn't be. */
export function failingCount(checks: Checks): number {
    return Array.isArray(checks) ? checks.filter((c) => !c.ok).length : 0;
}

/** "Checked before you publish": a tick, a warning or a cross, and what each means. */
export function PageChecks({ page }: { page: AnyPageData }) {
    const checks = useChecks(page);
    if (checks === "loading") {
        return (
            <div className="grid gap-2" aria-label="Checking the page">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-3/5" />
            </div>
        );
    }
    if (checks === "failed") {
        return (
            <p className="text-sm text-muted-foreground">
                The checks couldn&apos;t run just now. Reload to try again.
            </p>
        );
    }
    // What fails first, then what's worth a look, then the passes (F10).
    const rank = (c: SearchPageCheck) =>
        c.ok ? 2 : c.severity === "warning" ? 1 : 0;
    return (
        <ul className="grid">
            {[...checks]
                .sort((a, b) => rank(a) - rank(b))
                .map((c) => {
                    const warn = !c.ok && c.severity === "warning";
                    const Icon = c.ok ? Check : warn ? CircleAlert : X;
                    return (
                        <li
                            key={c.id}
                            className="flex items-start gap-3 border-t py-2.5 first:border-t-0"
                        >
                            <span
                                className={cn(
                                    "mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full",
                                    c.ok
                                        ? "bg-success-subtle text-success-subtle-foreground"
                                        : warn
                                          ? "bg-warning-subtle text-warning-subtle-foreground"
                                          : "bg-destructive-subtle text-destructive-subtle-foreground",
                                )}
                            >
                                <Icon className="size-3.5" aria-hidden />
                                <span className="sr-only">
                                    {c.ok
                                        ? "Passes:"
                                        : warn
                                          ? "Worth a look:"
                                          : "Fails:"}
                                </span>
                            </span>
                            <div className="grid gap-1">
                                <strong className="font-semibold">
                                    {c.title}
                                </strong>
                                {c.problems && c.problems.length > 1 ? (
                                    // Several to work through (facts for the CA): one a line.
                                    <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-muted-foreground">
                                        {c.problems.map((p) => (
                                            <li
                                                key={p}
                                                // "To confirm: the 5% rate…" reads as a list of "The 5% rate…".
                                                className="first-letter:uppercase"
                                            >
                                                {p.replace(/^To confirm: /, "")}
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    c.detail && (
                                        <span className="text-[13px] text-muted-foreground">
                                            {c.detail}
                                        </span>
                                    )
                                )}
                            </div>
                        </li>
                    );
                })}
        </ul>
    );
}
