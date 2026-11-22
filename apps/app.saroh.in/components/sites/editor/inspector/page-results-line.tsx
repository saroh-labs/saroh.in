"use client";

import { Button } from "@saroh/ui/button";
import { useEffect, useState } from "react";

import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type {
    PageResults,
    PageResultsRead,
    ResultPart,
} from "@/lib/sites/page-results-read";
import { readPageResults } from "@/lib/sites/page-results-read";

/**
 * The words for a page's measured parts (KTD-E8, RULES §6): only parts the
 * API counted, never a 0 it did not count; "since 18 Nov" when counting
 * began inside the week. "No visits yet" when visits were counted and
 * there were none.
 */
export function resultParts(results: PageResults): string[] {
    const part = (p: ResultPart | null, one: string, many?: string) =>
        p === null
            ? []
            : [
                  count(p.count, one, many) +
                      (p.since ? ` since ${formatDay(p.since)}` : ""),
              ];
    const { sells } = results;
    const started: [string, string] =
        sells.bookings && sells.shop
            ? ["booking or order started", "bookings or orders started"]
            : sells.shop
              ? ["order started", "orders started"]
              : ["booking started", "bookings started"];
    return [
        ...(results.visits?.count === 0 && !results.visits.since
            ? ["No visits yet"]
            : part(results.visits, "visit")),
        ...part(results.started, ...started),
        ...part(results.questions, "question"),
        ...part(results.paid, "paid", "paid"),
    ];
}

/**
 * "This page · last 7 days" (U47, `fix/WXKRest`): the page's results from
 * U47a's read. Nothing at all for someone who may not read Insights; a
 * failed read says so with Try again, never a blank or a 0.
 */
export function PageResultsLine({
    siteId,
    path,
}: {
    siteId: string;
    path: string;
}) {
    const [read, setRead] = useState<PageResultsRead | "loading">("loading");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let live = true;
        void readPageResults(siteId, path).then((next) => {
            if (live) setRead(next);
        });
        return () => {
            live = false;
        };
    }, [siteId, path, attempt]);

    if (read !== "loading" && read.ok && read.results === null) return null;
    const parts =
        read !== "loading" && read.ok && read.results
            ? resultParts(read.results)
            : [];
    if (read !== "loading" && read.ok && parts.length === 0) return null;

    return (
        <section
            aria-labelledby="page-results"
            data-page-results=""
            className="grid gap-1.5"
        >
            <h3 id="page-results" className="text-sm font-semibold">
                This page · last 7 days
            </h3>
            {read === "loading" ? (
                <p className="text-sm text-muted-foreground">Reading…</p>
            ) : !read.ok ? (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    Couldn&apos;t read this page&apos;s visits.
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-semibold"
                        onClick={() => {
                            setRead("loading");
                            setAttempt((n) => n + 1);
                        }}
                    >
                        Try again
                    </Button>
                </p>
            ) : (
                <p className="text-sm tabular-nums">{parts.join(" · ")}</p>
            )}
        </section>
    );
}
