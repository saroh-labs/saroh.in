"use client";

import { Badge } from "@saroh/ui/badge";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";

import type { AdminFlag } from "@/lib/control-plane";
import {
    chipIsOn,
    groupReleases,
    reviewOverdue,
    stateChip,
} from "@/lib/releases";

/**
 * The left pane (R1): every release, grouped by kind, searchable by its code
 * key or the name a business sees. A row is a link, so the choice lives in
 * the URL (`?release=KEY`) and can be shared.
 */
export function ReleaseList({
    flags,
    selectedKey,
    today,
}: {
    flags: AdminFlag[];
    selectedKey: string | undefined;
    today: string;
}) {
    const [query, setQuery] = useState("");
    const sections = groupReleases(flags, query);

    return (
        <nav aria-label="Releases" className="grid gap-4">
            <div>
                <Label htmlFor="release-search" className="sr-only">
                    Search releases
                </Label>
                <Input
                    id="release-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search releases"
                    autoComplete="off"
                />
            </div>
            {sections.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No release matches “{query.trim()}”. Search by its code name
                    or the name businesses see.
                </p>
            )}
            {sections.map((section) => (
                <section key={section.group} className="grid gap-1">
                    <h2 className="px-2 text-xs font-medium text-muted-foreground">
                        {section.label}
                    </h2>
                    <ul className="grid gap-0.5">
                        {section.flags.map((flag) => {
                            const selected = flag.key === selectedKey;
                            return (
                                <li key={flag.key}>
                                    <Link
                                        href={`/flags?release=${encodeURIComponent(flag.key)}`}
                                        scroll={false}
                                        aria-current={
                                            selected ? "page" : undefined
                                        }
                                        className={cn(
                                            "flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            selected && "bg-muted",
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate font-mono text-[13px] font-medium">
                                                {flag.key}
                                            </div>
                                            <div className="truncate text-[13px] text-muted-foreground">
                                                {flag.metadata.shownAs}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            <Badge
                                                variant={
                                                    chipIsOn(flag)
                                                        ? "success"
                                                        : "neutral"
                                                }
                                            >
                                                {stateChip(flag)}
                                            </Badge>
                                            {reviewOverdue(flag, today) && (
                                                <Badge variant="warning">
                                                    Review overdue
                                                </Badge>
                                            )}
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </nav>
    );
}
