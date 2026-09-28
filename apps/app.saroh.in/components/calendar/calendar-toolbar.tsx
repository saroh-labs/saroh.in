"use client";

import { Button } from "@saroh/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { LayerSwitches } from "@/components/calendar/layer-switches";
import { MonthStep } from "@/components/calendar/month-step";
import { TeamFilter } from "@/components/calendar/team-filter";
import type { CalendarView } from "@/components/calendar/view-switch";
import { ViewSwitch } from "@/components/calendar/view-switch";
import type { LayerStyle, Off } from "@/lib/calendar/layers";
import type { Edge } from "@/lib/calendar/range";
import type { TeamOption } from "@/lib/calendar/team";
import type { CalendarMonth, LayerKey } from "@/lib/calendar/types";

interface Step {
    href: string;
    label: string;
    /** At the edge of what the calendar reaches: greyed, and why. */
    edge: Edge | null;
}

/**
 * The row under the calendar's title, after the design: ‹ This month ›
 * (or This week), Month | Week (E25), then — pushed right — the team
 * filter (E24) and a switch per layer. Where ‹ or › stops, why is said on
 * the page as well as on the button: a reason only on hover is one a phone
 * never shows. Shared by the month and the week, so the two can't drift.
 */
export function CalendarToolbar({
    prev,
    next,
    current,
    view,
    people,
    person,
    onPerson,
    layers,
    off,
    totals,
    failed,
    onToggle,
}: {
    prev: Step;
    next: Step;
    /** "This month" or "This week", and whether it is the one shown. */
    current: { label: string; href: string; here: boolean };
    view: { value: CalendarView; hrefs: Record<CalendarView, string> };
    people: TeamOption[];
    person: string | null;
    onPerson: (id: string | null) => void;
    layers: LayerStyle[];
    off: Off;
    totals: CalendarMonth["totals"];
    failed: Set<string>;
    onToggle: (key: LayerKey) => void;
}) {
    const edgeNote = prev.edge?.note ?? next.edge?.note;
    return (
        <div className="!mt-0.5 flex flex-wrap items-center gap-1.5">
            <div className="flex gap-1">
                <MonthStep href={prev.href} label={prev.label} edge={prev.edge}>
                    <ChevronLeft className="size-4" />
                </MonthStep>
                {current.here ? (
                    // Already here: the design greys it and it does
                    // nothing, rather than reloading the same page.
                    <Button
                        variant="outline"
                        size="sm"
                        disabled
                        aria-current="date"
                        className="px-[11px] text-[12.5px] disabled:text-muted-foreground disabled:opacity-100"
                    >
                        {current.label}
                    </Button>
                ) : (
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="px-[11px] text-[12.5px]"
                    >
                        <Link href={current.href}>{current.label}</Link>
                    </Button>
                )}
                <MonthStep href={next.href} label={next.label} edge={next.edge}>
                    <ChevronRight className="size-4" />
                </MonthStep>
            </div>
            <ViewSwitch view={view.value} hrefs={view.hrefs} />
            {edgeNote ? (
                <span
                    id="calendar-edge"
                    className="text-[12px] text-muted-foreground"
                >
                    {edgeNote}
                </span>
            ) : null}
            <span className="flex-1" />
            {people.length > 0 ? (
                <TeamFilter
                    options={people}
                    value={person}
                    onChange={onPerson}
                />
            ) : null}
            <LayerSwitches
                layers={layers}
                off={off}
                totals={totals}
                failed={failed}
                onToggle={onToggle}
            />
        </div>
    );
}
