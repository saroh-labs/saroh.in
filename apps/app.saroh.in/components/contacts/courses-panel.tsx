"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useState } from "react";

import { EnrolDialog } from "@/components/courses/enrol-dialog";
import type { ContactOption } from "@/components/shared/contact-picker";
import type { Course, Enrollment } from "@/lib/courses/service";

import { ContactPanelSection, ROW_BODY, ROW_RULE } from "./contact-panel";

const STANDING_WORD = {
    DRAFT: "draft",
    ISSUED: "issued",
    OVERDUE: "overdue",
    PAID: "paid",
    VOID: "void",
} as const;

/**
 * A person's course seats: the course, their sessions still to come, and
 * whether they are still on it — each row opens the course. "Enrol" opens
 * the course page's enrol dialog with this person chosen, asking which of
 * the open courses with a seat left (one they are not already on).
 */
export function CoursesPanel({
    contact,
    enrollments,
    courses,
    invoicesOnEnrol,
    mentionInvoices,
}: {
    contact: ContactOption;
    /** Null when they could not be read. */
    enrollments: Enrollment[] | null;
    /** Open courses; null when this person may not enrol, or they failed. */
    courses: Course[] | null;
    invoicesOnEnrol: boolean;
    mentionInvoices: boolean;
}) {
    const [enrolling, setEnrolling] = useState(false);
    const rows = enrollments
        ? [...enrollments].sort(
              (a, b) =>
                  Number(a.status !== "ACTIVE") - Number(b.status !== "ACTIVE"),
          )
        : null;
    const onAlready = new Set(
        (enrollments ?? [])
            .filter((e) => e.status === "ACTIVE")
            .map((e) => e.course.id),
    );
    const open = courses
        ? courses.filter(
              (c) =>
                  c.status === "OPEN" &&
                  c.seatsLeft > 0 &&
                  c.sessionsLeft > 0 &&
                  !onAlready.has(c.id),
          )
        : null;

    return (
        <>
            <ContactPanelSection
                title="Courses"
                count={rows ? rows.length : null}
                failed="Their courses"
                empty={`${contact.name} is not on a course.${open && open.length > 0 ? " Enrol them and every session left is booked for them." : ""}`}
                action={
                    open ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEnrolling(true)}
                        >
                            Enrol
                        </Button>
                    ) : null
                }
            >
                {rows ? (
                    <ul>
                        {rows.map((e) => {
                            const on = e.status === "ACTIVE";
                            const n = e.upcoming;
                            return (
                                <li key={e.id} className={ROW_RULE}>
                                    <Link
                                        href={`/courses/${e.course.id}`}
                                        className={`${ROW_BODY} transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13.5px] font-medium">
                                                {e.course.name}
                                            </span>
                                            <span className="block truncate text-[11.5px] text-muted-foreground">
                                                {on
                                                    ? n === 0
                                                        ? "No sessions to come"
                                                        : `${n} ${n === 1 ? "session" : "sessions"} to come`
                                                    : "Taken off the course"}
                                                {mentionInvoices && e.invoice
                                                    ? ` · invoice ${STANDING_WORD[e.invoice.standing]}`
                                                    : ""}
                                            </span>
                                        </span>
                                        <Badge
                                            variant={on ? "success" : "neutral"}
                                        >
                                            {on ? "Enrolled" : "Cancelled"}
                                        </Badge>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
            </ContactPanelSection>
            {open ? (
                <EnrolDialog
                    open={enrolling}
                    onOpenChange={setEnrolling}
                    courses={open}
                    contacts={[contact]}
                    initialContactId={contact.id}
                    invoicesOnEnrol={invoicesOnEnrol}
                />
            ) : null}
        </>
    );
}
