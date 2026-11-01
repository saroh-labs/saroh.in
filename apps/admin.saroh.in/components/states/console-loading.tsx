"use client";

import { PageContainer } from "@saroh/ui/page-container";
import { Skeleton } from "@saroh/ui/skeleton";
import { usePathname } from "next/navigation";

import { ConsoleFrame } from "@/components/console-frame";

import { PanelSkeleton } from "./panel-skeleton";

export type ConsoleSkeleton = "list" | "board" | "detail";

/** Sections whose second step is one record's page. */
const RECORDS = new Set([
    "businesses",
    "users",
    "people",
    "releases",
    "search-pages",
]);

/**
 * Which shape a console address draws while it loads: a record's page
 * (header, tabs, panels), the Leads board, or a list. Exported for its test.
 */
export function skeletonFor(pathname: string): ConsoleSkeleton {
    if (/^\/leads(?:\/|$)/.test(pathname)) return "board";
    const [, section, record] = pathname.split("/");
    if (!record) return "list";
    if (section === "team") {
        return ["roles", "payouts", "me"].includes(record) ? "list" : "detail";
    }
    if (section === "operations") {
        return pathname.startsWith("/operations/runs/") ? "detail" : "list";
    }
    if (section === "billing") {
        return pathname.startsWith("/billing/invoices/") &&
            !pathname.endsWith("/export")
            ? "detail"
            : "list";
    }
    return RECORDS.has(section) ? "detail" : "list";
}

/**
 * Every console page on its way (audits, 1 Nov: a click on a slow network
 * showed nothing): the console's frame with the rail's and the bar's
 * shapes, and the page's shape below, as Plans streams its own. One
 * component for every `loading.tsx` above a page that draws the shell;
 * a tab under a header the layout already drew takes `PanelSkeleton`.
 */
export default function ConsoleLoading() {
    const pathname = usePathname();
    const shape = skeletonFor(pathname);
    const section = pathname.split("/")[1].replace(/-/g, " ");
    const label =
        shape === "detail" || !section
            ? "Loading the page"
            : `Loading ${section}`;

    return (
        <ConsoleFrame
            search={<Skeleton className="h-9 w-full max-w-md rounded-md" />}
            account={<Skeleton className="h-8 w-40 rounded-md" />}
            rail={
                <div
                    aria-hidden
                    className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-16 shrink-0 flex-col gap-3 self-start border-r border-border px-3 py-5 min-[760px]:flex min-[1101px]:w-[238px]"
                >
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <Skeleton key={i} className="h-7 rounded-md" />
                    ))}
                </div>
            }
        >
            <PageContainer width="full">
                <div className="grid min-w-0 gap-5">
                    <div aria-hidden className="grid gap-2.5">
                        <Skeleton className="h-3 w-28 rounded-[4px]" />
                        <Skeleton className="h-7 w-56 rounded-[6px]" />
                        <Skeleton className="h-4 w-full max-w-md rounded-[4px]" />
                    </div>
                    {shape === "detail" ? (
                        <>
                            <div
                                aria-hidden
                                className="flex gap-4 border-b border-border pb-2"
                            >
                                {[64, 80, 56, 72, 60].map((w) => (
                                    <Skeleton
                                        key={w}
                                        className="h-5"
                                        style={{ width: w }}
                                    />
                                ))}
                            </div>
                            <div className="grid gap-6 lg:grid-cols-2">
                                <PanelSkeleton label={label} rows={4} />
                                <div aria-hidden>
                                    <PanelSkeleton label="" rows={4} />
                                </div>
                            </div>
                        </>
                    ) : shape === "board" ? (
                        <>
                            <span role="status" className="sr-only">
                                {label}
                            </span>
                            <div
                                aria-hidden
                                className="grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-6"
                            >
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div
                                        key={i}
                                        className="grid content-start gap-2"
                                    >
                                        <Skeleton className="h-5 w-24 rounded-[4px]" />
                                        <Skeleton className="h-24 rounded-[11px]" />
                                        <Skeleton className="h-24 rounded-[11px]" />
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <Skeleton
                                aria-hidden
                                className="h-10 rounded-[11px]"
                            />
                            <PanelSkeleton label={label} rows={8} />
                        </>
                    )}
                </div>
            </PageContainer>
        </ConsoleFrame>
    );
}
