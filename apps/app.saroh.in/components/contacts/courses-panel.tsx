"use client";

import { count } from "@/lib/format/plural";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { useState } from "react";

import { EnrolDialog } from "@/components/courses/enrol-dialog";
import type { ContactOption } from "@/components/shared/fields/contact-picker";
import { PageLoading } from "@/components/shared/page/page-loading";
import { useContactCourses } from "@/lib/courses/use-courses";

import { ContactPanelSection, ROW_BODY, ROW_RULE } from "./contact-panel";

const STANDING_WORD = {
    DRAFT: "draft",
    ISSUED: "issued",
    OVERDUE: "overdue",
    PAID: "paid",
    VOID: "void",
    CREDITED: "credited",
} as const;

/**
 * A person's course seats: the course, their sessions still to come, and
 * whether they are still on it — each row opens the course. "Enrol" opens
 * the course page's enrol dialog with this person chosen, asking which of
 * the open courses with a seat left (one they are not already on).
 *
 * On React Query (DEC-259): their seats, the open courses and the GST
 * standing are one read (`/api/courses/contact/[contactId]`), read again
 * after an enrolment (`useCourseSave`).
 */
export function CoursesPanel({
    contact,
    invoicesOnEnrol,
    mentionInvoices,
}: {
    contact: ContactOption;
    invoicesOnEnrol: boolean;
    mentionInvoices: boolean;
}) {
    const [enrolling, setEnrolling] = useState(false);
    const read = useContactCourses({ contactId: contact.id });
    if (!read.data && !read.isError) {
        return (
            <PageLoading
                bare
                width="full"
                shape="rows"
                rows={2}
                label="Loading their courses"
            />
        );
    }
    // A failed read is said in the panel, as each part failing is.
    const {
        enrollments,
        open: courses,
        gst,
    } = read.data ?? {
        enrollments: null,
        open: null,
        gst: null,
    };
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
                                    <IntentLink
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
                                                        : `${count(n, "session")} to come`
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
                                    </IntentLink>
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
                    gst={gst}
                />
            ) : null}
        </>
    );
}
