"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { bookingsKeys } from "@/lib/bookings/queries";
import { customersKeys } from "@/lib/customers/queries";
import { homeKeys } from "@/lib/home/queries";
import { invoicesKeys } from "@/lib/invoices/queries";
import { useOrgId } from "@/lib/query/org";

import type { ContactCoursesAsk, CourseAsk } from "./queries";
import {
    contactCoursesRead,
    courseRead,
    coursesKeys,
    coursesListRead,
} from "./queries";

/** Every course of the open business (DEC-259). */
export function useCourses() {
    return useQuery(coursesListRead.options(useOrgId(), {}));
}

/** One course's page. */
export function useCourse(ask: CourseAsk) {
    return useQuery(courseRead.options(useOrgId(), ask));
}

/** A person's Courses tab. */
export function useContactCourses(ask: ContactCoursesAsk) {
    return useQuery(contactCoursesRead.options(useOrgId(), ask));
}

/**
 * After a course write landed: what Courses has on screen is read again,
 * and a customer's page too (enrolling from it books and invoices them),
 * resolving once they are back so a busy state lasts until the screen has
 * changed. Sessions are bookings and an enrolment issues an invoice, so
 * Bookings, Invoices and Home are marked stale for their next visit. Never
 * throws: a read that fails is the screen's failed state.
 */
export function coursesSaved(qc: QueryClient, orgId: string): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: coursesKeys(orgId) }),
        qc.invalidateQueries({ queryKey: customersKeys(orgId) }),
        qc.invalidateQueries({ queryKey: bookingsKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: invoicesKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Courses part saves: `orgId` goes last to each write (the action
 * runs it through `writeAsOrg`, refusing a moved tab), and `saved()` once
 * it landed. A refused write calls nothing.
 */
export interface CourseSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useCourseSave(): CourseSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => coursesSaved(qc, orgId) }),
        [qc, orgId],
    );
}
