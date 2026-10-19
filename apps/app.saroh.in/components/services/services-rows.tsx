"use client";

import { cn } from "@saroh/ui/lib/utils";
import { listTable } from "@saroh/ui/list-table";
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
 * At the desk (BKDStates): a table of Service, "How long · price · who",
 * This week, Who can book it and Taking bookings. The name opens the
 * service. A role that can't change services reads On or Off.
 */
export function ServicesTable({ rows, onTaking, busy }: RowsProps) {
    return (
        <ScrollX label="Services" className={listTable.frame}>
            <table
                data-services-table=""
                className="w-full border-collapse text-[13.5px]"
            >
                <thead data-ph-unmask="">
                    <tr className={listTable.headRow}>
                        <th scope="col" className={listTable.th}>
                            Service
                        </th>
                        <th scope="col" className={listTable.th}>
                            How long · price · who
                        </th>
                        <th scope="col" className={listTable.th}>
                            This week
                        </th>
                        <th
                            scope="col"
                            className={cn(listTable.th, "w-[170px]")}
                        >
                            Who can book it
                        </th>
                        <th
                            scope="col"
                            className={cn(listTable.th, "w-[150px]")}
                        >
                            {TAKING_LABEL}
                        </th>
                    </tr>
                </thead>
                <tbody data-ph-mask="">
                    {rows.map((row) => (
                        <tr key={row.service.id} className={listTable.tr}>
                            <td className={cn(listTable.td, "min-w-[180px]")}>
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
                            </td>
                            <td
                                className={cn(
                                    listTable.td,
                                    "text-muted-foreground",
                                )}
                            >
                                {row.line}
                            </td>
                            <td
                                className={cn(
                                    listTable.td,
                                    "text-muted-foreground",
                                )}
                            >
                                {row.weekDesk}
                            </td>
                            <td className={listTable.td}>
                                <WhoTag who={row.who} />
                            </td>
                            <td className={listTable.td}>
                                {onTaking ? (
                                    <TakingSwitch
                                        row={row}
                                        onTaking={onTaking}
                                        busy={busy}
                                        stacked={false}
                                    />
                                ) : (
                                    <span className="text-[12.5px] text-muted-foreground">
                                        {row.who === "paused" ? "Off" : "On"}
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </ScrollX>
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
