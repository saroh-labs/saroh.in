import { ListTable } from "@saroh/ui/list-table";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { GROUP_ICONS } from "./group-icons";
import type { SiteGroup, SiteGroupId } from "./group-map";

/**
 * The site's home on a phone (WXHOverviewPhone): the four groups, each with
 * one line of how it stands, opening on its first screen. Until Overview
 * (U4) is built, the desk shows the same list.
 */
export function SiteHome({
    groups,
    lines,
}: {
    groups: readonly SiteGroup[];
    /** One line per group, from what the site already knows; none is left out. */
    lines: Partial<Record<SiteGroupId, string>>;
}) {
    return (
        <ListTable>
            <ul aria-label="This site" className="divide-y divide-border">
                {groups.map((group) => {
                    const Icon = GROUP_ICONS[group.id];
                    // In the area first: Look's screens all open elsewhere.
                    const to =
                        group.sections.find((s) => !s.leaves) ??
                        group.sections[0];
                    return (
                        <li key={group.id}>
                            <Link
                                href={to.href}
                                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                                    <Icon aria-hidden className="size-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold">
                                        {group.label}
                                    </span>
                                    <span className="block truncate text-sm text-muted-foreground">
                                        {lines[group.id] ??
                                            group.sections
                                                .map((s) => s.label)
                                                .join(" · ")}
                                    </span>
                                </span>
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground"
                                />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </ListTable>
    );
}
