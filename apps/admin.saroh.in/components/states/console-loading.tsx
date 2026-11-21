"use client";

import { usePathname } from "next/navigation";

import type { ConsoleSkeleton } from "./console-page-shape";
import { ConsolePageShape } from "./console-page-shape";
import { PanelSkeleton } from "./panel-skeleton";
import { TableSkeleton } from "./table-skeleton";

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
 * The console's tables and how many columns each draws, so a list on its
 * way is grey in the table's own shape. A list that isn't a table (Users,
 * Waitlist, Messages) keeps the list skeleton.
 */
const TABLE_COLUMNS: Record<string, number> = {
    "/businesses": 6,
    "/billing/subscriptions": 6,
    "/billing/invoices": 8,
    "/billing/events": 4,
    "/releases": 5,
    "/search-pages": 6,
    "/usage": 6,
    "/operations/jobs": 6,
    "/operations/webhooks": 5,
    "/team/roles": 8,
    "/audit": 7,
    "/plans": 4,
};

/** How many columns a console address's table has, if it is a table. */
export function columnsFor(pathname: string): number | undefined {
    return TABLE_COLUMNS[pathname.replace(/\/$/, "") || "/"];
}

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
 * A console page on its way, inside the console's frame, which the root
 * layout draws and which never blanks (owner, 21 Nov): the page's own
 * shape, a table with its columns where the page is a table.
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
        <ConsolePageShape
            shape={shape}
            label={label}
            columns={columnsFor(pathname)}
        />
    );
}

/**
 * A tab's body on its way, under a header and tabs a layout already drew
 * (Billing, Team): the open tab's table, or a panel where it isn't one.
 */
export function TabBodyLoading({ label }: { label: string }) {
    const columns = columnsFor(usePathname());
    return columns ? (
        <TableSkeleton label={label} columns={columns} />
    ) : (
        <PanelSkeleton label={label} rows={8} />
    );
}
