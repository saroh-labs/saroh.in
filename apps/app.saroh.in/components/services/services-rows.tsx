"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ListTable, ListTableHead, listTable } from "@saroh/ui/list-table";
import { ScrollX } from "@saroh/ui/scroll-x";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";

import { PlanWay } from "@/components/billing/plan-way";
import { SwitchRow } from "@/components/shared/check-row";
import { StatusBadge } from "@/components/shared/status-badge";
import { isPlanHref } from "@/lib/billing/plan-access";
import type { OnlineProblem } from "@/lib/services/online-booking";
import type { Service } from "@/lib/services/service";
import type { WhoCanBook } from "@/lib/services/service-cards";
import { TAKING_LABEL, WHO_TAG } from "@/lib/services/service-cards";

/** One service as the list draws it, at either size. */
export interface ServiceRowView {
    service: Service;
    who: WhoCanBook;
    /** "45 min · ₹1,200 · Meera". */
    line: string;
    /** "6 booked this week · 9 to come". */
    weekPhone: string;
    /** "6 booked · 9 to come", under "This week". */
    weekDesk: string;
    /** Why customers can't book it online, with the way to fix it. */
    problem: OnlineProblem | null;
}

export interface RowsProps {
    rows: readonly ServiceRowView[];
    /** Null for a role that can't change services: no switch. */
    onTaking: ((row: ServiceRowView, next: boolean) => void) | null;
    /** The id of the service whose switch is saving. */
    busy: string | null;
}

const hrefOf = (s: Service) => `/services/${s.id}`;

/** "Who can book it": Customers and team, Customers only, Team only, Paused. */
export function WhoTag({ who }: { who: WhoCanBook }) {
    return who === "paused" ? (
        // Paused in words, the status vocabulary's own.
        <StatusBadge thing="service" status="NOT_TAKING" />
    ) : (
        <StatusBadge tone={WHO_TAG[who].tone}>{WHO_TAG[who].word}</StatusBadge>
    );
}

/** "Can't be booked online: Payments is off. Turn on Payments". */
function Problem({
    problem,
    className,
}: {
    problem: OnlineProblem;
    className?: string;
}) {
    return (
        <span className={cn("block text-warning-subtle-foreground", className)}>
            {problem.line}{" "}
            <PlanWay
                when={isPlanHref(problem.fix.href)}
                className="text-[length:inherit] text-inherit"
            >
                <TextLink href={problem.fix.href} className="text-inherit">
                    {problem.fix.label}
                </TextLink>
            </PlanWay>
        </span>
    );
}

function TakingSwitch({
    row,
    onTaking,
    busy,
    stacked,
}: {
    row: ServiceRowView;
    onTaking: (row: ServiceRowView, next: boolean) => void;
    busy: string | null;
    /** On a phone the word sits under the switch. */
    stacked: boolean;
}) {
    const on = row.who !== "paused";
    return (
        <SwitchRow
            checked={on}
            disabled={busy === row.service.id}
            name={`${TAKING_LABEL}, ${row.service.name}`}
            size="default"
            side="start"
            onChange={(next) => onTaking(row, next)}
            className={
                stacked
                    ? "min-w-14 flex-col gap-[3px] pt-0.5"
                    : "gap-2 whitespace-nowrap"
            }
        >
            <span
                className={cn(
                    "text-muted-foreground",
                    stacked ? "text-[10.5px] font-semibold" : "text-[12.5px]",
                )}
            >
                {on ? "On" : "Off"}
            </span>
        </SwitchRow>
    );
}

/**
 * The desk table's five columns: Service, "How long · price · who", This
 * week, Who can book it and Taking bookings. The gap is the two cells'
 * padding a ruled table had between them.
 */
const DESK_GRID =
    "grid grid-cols-[minmax(180px,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_142px_122px] items-center gap-x-[28px]";

/**
 * At the desk (BKDStates): a table of Service, "How long · price · who",
 * This week, Who can book it and Taking bookings. The name opens the
 * service. A role that can't change services reads On or Off. Drawn with
 * the shared list pieces (`ListTable`, `ListTableHead`, `listTable.row`)
 * and a table's roles, so a screen reader still reads it as one.
 */
export function ServicesTable({ rows, onTaking, busy }: RowsProps) {
    return (
        <ListTable scroll>
            <ScrollX label="Services">
                <div
                    role="table"
                    aria-label="Services"
                    data-services-table=""
                    className="min-w-[720px] text-[13.5px]"
                >
                    <div role="rowgroup">
                        <ListTableHead role="row" className={DESK_GRID}>
                            <span
                                role="columnheader"
                                className="whitespace-nowrap"
                            >
                                Service
                            </span>
                            <span
                                role="columnheader"
                                className="whitespace-nowrap"
                            >
                                How long · price · who
                            </span>
                            <span
                                role="columnheader"
                                className="whitespace-nowrap"
                            >
                                This week
                            </span>
                            <span
                                role="columnheader"
                                className="whitespace-nowrap"
                            >
                                Who can book it
                            </span>
                            <span
                                role="columnheader"
                                className="whitespace-nowrap"
                            >
                                {TAKING_LABEL}
                            </span>
                        </ListTableHead>
                    </div>
                    <div role="rowgroup" data-ph-mask="">
                        {rows.map((row) => (
                            <div
                                key={row.service.id}
                                role="row"
                                data-service-row=""
                                className={cn(listTable.row, DESK_GRID)}
                            >
                                <div role="cell" className="min-w-0">
                                    <Link
                                        href={hrefOf(row.service)}
                                        className="font-semibold text-foreground underline-offset-4 hover:underline"
                                    >
                                        {row.service.name}
                                    </Link>
                                    {row.problem ? (
                                        <Problem
                                            problem={row.problem}
                                            className="mt-1 text-[12px]"
                                        />
                                    ) : null}
                                </div>
                                <div
                                    role="cell"
                                    className="min-w-0 text-muted-foreground"
                                >
                                    {row.line}
                                </div>
                                <div
                                    role="cell"
                                    className="min-w-0 text-muted-foreground"
                                >
                                    {row.weekDesk}
                                </div>
                                <div role="cell" className="min-w-0">
                                    <WhoTag who={row.who} />
                                </div>
                                <div role="cell" className="min-w-0">
                                    {onTaking ? (
                                        <TakingSwitch
                                            row={row}
                                            onTaking={onTaking}
                                            busy={busy}
                                            stacked={false}
                                        />
                                    ) : (
                                        <span className="text-[12.5px] text-muted-foreground">
                                            {row.who === "paused"
                                                ? "Off"
                                                : "On"}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </ScrollX>
        </ListTable>
    );
}

/**
 * On a phone (BKMServices): a row a service, its name with a tag when it
 * isn't booked by both, "how long · price · who", how it is booked, and
 * the Taking bookings switch with On or Off under it. The words open the
 * service; the switch beside them never does.
 */
export function ServicesPhoneList({ rows, onTaking, busy }: RowsProps) {
    return (
        <ul data-services-list="" data-ph-mask="" className={listTable.card}>
            {rows.map((row) => (
                <li
                    key={row.service.id}
                    className="flex items-start gap-2.5 border-b border-border py-3 pl-3.5 pr-2 last:border-b-0"
                >
                    <div className="min-w-0 flex-1">
                        <Link
                            href={hrefOf(row.service)}
                            className="block text-foreground"
                        >
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="text-[14.5px] font-semibold">
                                    {row.service.name}
                                </span>
                                {row.who === "both" ? null : (
                                    <WhoTag who={row.who} />
                                )}
                            </span>
                            <span className="mt-0.5 block text-[12.5px]">
                                {row.line}
                            </span>
                            <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                                {row.weekPhone}
                            </span>
                        </Link>
                        {row.problem ? (
                            <Problem
                                problem={row.problem}
                                className="mt-1.5 text-[12.5px]"
                            />
                        ) : null}
                    </div>
                    {onTaking ? (
                        <TakingSwitch
                            row={row}
                            onTaking={onTaking}
                            busy={busy}
                            stacked
                        />
                    ) : null}
                </li>
            ))}
        </ul>
    );
}
