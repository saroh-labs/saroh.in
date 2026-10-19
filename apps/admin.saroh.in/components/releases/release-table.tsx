"use client";

import { Badge } from "@saroh/ui/badge";
import { Chip } from "@saroh/ui/chip";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListTable, listTable, ListTableHead } from "@saroh/ui/list-table";
import { ListToolbar } from "@saroh/ui/list-toolbar";
import Link from "next/link";
import { useState } from "react";

import { changedRowProps } from "@/components/changed-row";
import { EmptyPanel } from "@/components/states/empty-panel";
import type { AdminFlag, AdminOrganization } from "@/lib/control-plane";
import { formatDateTime } from "@/lib/format";
import type { ReleaseState } from "@/lib/releases";
import {
    businesses,
    chipIsOn,
    groupLabel,
    haveItCount,
    passesFilter,
    releaseHref,
    releaseState,
    reviewOverdue,
    sortReleases,
    STATE_FILTERS,
    STATE_LABEL,
} from "@/lib/releases";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { ReleaseActions } from "./release-actions";
import { ReleaseFeedbackContext } from "./use-release-change";

type Show = ReleaseState | "all";

/** Name · State · Businesses · Last change · the row's ⋯ menu. */
const COLUMNS =
    "md:grid md:grid-cols-[minmax(0,2fr)_9rem_8rem_minmax(0,1.4fr)_2.5rem] md:items-center md:gap-4";

/**
 * Every release as a table (R11): the name a business sees first with the
 * code name small below it, a state pill, how many businesses have it, and
 * the last change and who made it. Chips (All · On for everyone · On for
 * some · Off) and a search narrow it.
 *
 * A change made from a row's ⋯ menu lights that row, and a row the chip
 * would now hide stays in place, lit, until the chip or the search changes
 * (R9). On a phone each row stacks.
 */
export function ReleaseTable({
    flags,
    organizations,
    canPublish,
    today,
}: {
    flags: AdminFlag[];
    organizations: AdminOrganization[];
    canPublish: boolean;
    today: string;
}) {
    const [show, setShow] = useState<Show>("all");
    const [query, setQuery] = useState("");
    // Bumped to empty the search field from outside it.
    const [searchKey, setSearchKey] = useState(0);
    const feedback = useChangeFeedback({ filterKey: `${show}|${query}` });
    const sorted = sortReleases(flags);
    const { rows, highlighted } = feedback.keep(sorted, {
        id: (flag) => flag.key,
        passes: (flag) => passesFilter(flag, show, query),
    });
    const count = (value: Show) =>
        value === "all"
            ? flags.length
            : flags.filter((flag) => releaseState(flag) === value).length;
    const narrowed = show !== "all" || query !== "";
    const clear = () => {
        setShow("all");
        setQuery("");
        setSearchKey((n) => n + 1);
    };

    return (
        <div className="grid gap-3">
            <ListToolbar
                search={
                    <ListSearch
                        key={searchKey}
                        placeholder="Search releases"
                        describe="By the name businesses see or the code name"
                        defaultValue={query}
                        onSearch={setQuery}
                    />
                }
                filters={
                    <div
                        role="group"
                        aria-label="Show"
                        className="flex flex-wrap gap-2"
                    >
                        {STATE_FILTERS.map((chip) => (
                            <Chip
                                key={chip.value}
                                as="toggle"
                                on={show === chip.value}
                                onClick={() => setShow(chip.value)}
                            >
                                {chip.label}
                                <span className="tabular-nums opacity-70">
                                    {count(chip.value)}
                                </span>
                            </Chip>
                        ))}
                    </div>
                }
                onClear={narrowed ? clear : undefined}
                clearLabel={show === "all" ? "Clear search" : "Clear filters"}
            />

            {rows.length === 0 ? (
                <EmptyPanel
                    kind="no-results"
                    things="releases"
                    cause={query && show === "all" ? "search" : "filters"}
                    query={query}
                    onClear={clear}
                />
            ) : (
                <ListTable>
                    <ListTableHead className={cn("hidden", COLUMNS)}>
                        <span>Release</span>
                        <span>State</span>
                        <span>Businesses</span>
                        <span>Last change</span>
                        <span className="sr-only">Actions</span>
                    </ListTableHead>
                    <ul aria-label="Releases">
                        <ReleaseFeedbackContext.Provider
                            value={feedback.report}
                        >
                            {rows.map((flag) => (
                                <ReleaseRow
                                    key={flag.key}
                                    flag={flag}
                                    organizations={organizations}
                                    canPublish={canPublish}
                                    today={today}
                                    changed={highlighted(flag.key)}
                                />
                            ))}
                        </ReleaseFeedbackContext.Provider>
                    </ul>
                </ListTable>
            )}
        </div>
    );
}

function ReleaseRow({
    flag,
    organizations,
    canPublish,
    today,
    changed,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
    canPublish: boolean;
    today: string;
    changed: boolean;
}) {
    const have = haveItCount(flag, organizations);
    const last = flag.lastChange ?? null;
    return (
        <li
            {...changedRowProps(changed)}
            className={cn(
                listTable.row,
                "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5",
                COLUMNS,
            )}
        >
            <div className="col-start-1 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
                <Link
                    href={releaseHref(flag.key)}
                    className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {flag.metadata.shownAs}
                </Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                    <code className="break-all font-mono">{flag.key}</code>
                    <span aria-hidden>·</span>
                    <span>{groupLabel(flag.metadata.group)}</span>
                    {reviewOverdue(flag, today) && (
                        <Badge variant="warning">Review overdue</Badge>
                    )}
                </div>
            </div>
            <div className="col-span-2 md:col-span-1">
                <Badge variant={chipIsOn(flag) ? "success" : "neutral"}>
                    {STATE_LABEL[releaseState(flag)]}
                </Badge>
            </div>
            <div className="col-span-2 text-[13px] tabular-nums text-muted-foreground md:col-span-1 md:text-foreground">
                <span className="md:hidden">Has it: </span>
                {organizations.length > 0 && have === organizations.length
                    ? `All ${businesses(have)}`
                    : businesses(have)}
            </div>
            <div className="col-span-2 min-w-0 text-[13px] text-muted-foreground md:col-span-1">
                {last ? (
                    <>
                        <time dateTime={last.at} className={listTable.time}>
                            {formatDateTime(last.at)}
                        </time>
                        <span className="block truncate">
                            by {last.actorName ?? "a former staff member"}
                        </span>
                    </>
                ) : (
                    "No changes yet"
                )}
            </div>
            <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
                {canPublish && (
                    <ReleaseActions
                        flag={flag}
                        organizations={organizations}
                        layout="row"
                    />
                )}
            </div>
        </li>
    );
}
