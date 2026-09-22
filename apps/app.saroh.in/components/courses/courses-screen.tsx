"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { GraduationCap } from "lucide-react";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import type { CourseTab } from "@/lib/courses/seats";
import {
    courseTab,
    runsLine,
    seatsTakenLine,
    TAB_LABEL,
} from "@/lib/courses/seats";
import type { Course } from "@/lib/courses/service";
import { invoiceMoney } from "@/lib/invoices/money";

const BADGE: Record<CourseTab, "success" | "warning" | "neutral" | "info"> = {
    OPEN: "success",
    FULL: "warning",
    CLOSED: "neutral",
    DRAFT: "neutral",
    PAST: "neutral",
};

/**
 * The tabs, after the design. They never overlap: a course is on exactly
 * one, worked out from its status, its seats and whether it has anything
 * left to run (`courseTab`).
 */
const FILTERS: DataFilter<Course>[] = (
    ["OPEN", "FULL", "CLOSED", "DRAFT", "PAST"] as const
).map((tab) => ({
    id: tab.toLowerCase(),
    label: TAB_LABEL[tab],
    predicate: (c: Course) => courseTab(c) === tab,
}));

const hours = (minutes: number) =>
    minutes % 60 === 0
        ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
        : `${minutes} min`;

/**
 * Courses, after the "Saroh Billing and Classes" design: each course, when
 * it runs, how many seats are taken and its price. Seats come from real
 * enrolments, so this row and the roster can never disagree.
 */
export function CoursesScreen({
    courses,
    canWrite,
    initialFilterId,
}: {
    courses: Course[];
    canWrite: boolean;
    initialFilterId?: string;
}) {
    const columns: DataColumn<Course>[] = [
        {
            id: "course",
            header: "Course",
            priority: "primary",
            sortValue: (c) => c.name.toLowerCase(),
            cell: (c) => (
                <span className="block min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                        {c.service.name} · {hours(c.service.durationMinutes)}
                    </span>
                </span>
            ),
        },
        {
            id: "runs",
            header: "Runs",
            priority: "secondary",
            sortValue: (c) =>
                c.nextSessionAt ?? c.sessions.at(-1)?.startAt ?? "",
            cell: (c) => runsLine(c),
        },
        {
            id: "seats",
            header: "Seats",
            priority: "secondary",
            sortValue: (c) => c.seatsLeft,
            cell: (c) => seatsTakenLine(c),
        },
        {
            id: "price",
            header: "Price",
            priority: "detail",
            numeric: true,
            money: true,
            sortValue: (c) => Number(c.price),
            cell: (c) => invoiceMoney(c.price, c.currency),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            cell: (c) => {
                const tab = courseTab(c);
                return <Badge variant={BADGE[tab]}>{TAB_LABEL[tab]}</Badge>;
            },
        },
    ];

    return (
        <>
            <PageHeader
                title="Courses"
                className="mb-0"
                actions={
                    canWrite ? (
                        <Button asChild>
                            <Link href="/courses/new">New course</Link>
                        </Button>
                    ) : undefined
                }
            />
            <DataView
                viewId="courses"
                rows={courses}
                columns={columns}
                rowKey={(c) => c.id}
                rowHref={(c) => `/courses/${c.id}`}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                initialFilterId={initialFilterId}
                noun={{ one: "course", other: "courses" }}
                searchPlaceholder="Search courses"
                searchableColumnIds={["course"]}
                emptyState={{
                    icon: <GraduationCap />,
                    title: "No courses yet",
                    note: "A course is a run of dated sessions with seats and a price, like a six-week class. Enrolling someone books every session and invoices them.",
                    action: canWrite ? (
                        <Button asChild>
                            <Link href="/courses/new">New course</Link>
                        </Button>
                    ) : undefined,
                }}
            />
        </>
    );
}
