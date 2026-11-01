"use client";

import { Skeleton } from "@saroh/ui/skeleton";
import { usePathname } from "next/navigation";

import { ConsoleFrame } from "@/components/console-frame";

import type { ConsoleSkeleton } from "./console-page-shape";
import { ConsolePageShape } from "./console-page-shape";

export type { ConsoleSkeleton } from "./console-page-shape";

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
            <ConsolePageShape shape={shape} label={label} />
        </ConsoleFrame>
    );
}
