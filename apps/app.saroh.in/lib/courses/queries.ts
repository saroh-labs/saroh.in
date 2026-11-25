import { z } from "zod";

import type { GstAsk } from "@/lib/gst/item-words";
import type { PriceHistoryPage } from "@/lib/price-history/words";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { Course, CourseDetail, Enrollment } from "./service";

/**
 * Courses' reads (DEC-259): the list, one course and a person's seats.
 * Client-safe: the keys and the routes; the services are paired in
 * `access-server.ts`.
 */

/** Every Courses read of a business. */
export const coursesKeys = (orgId: string): DomainKey =>
    domainKey("courses", orgId);

const ID = z.string().regex(/^[\w-]{1,64}$/);

/** Every course, for the list's tabs (Open, Full, Closed, Draft, Past). */
export const coursesListRead = defineRead<Course[]>()({
    key: (orgId) => domainKey("courses", orgId, "list"),
    route: { path: "/api/courses", params: {} },
    tier: "records",
});

/** A course's page: the course with its sessions and roster. */
export interface CourseView {
    course: CourseDetail;
    /** What it has cost, newest first; null when that read failed. */
    priceHistory: PriceHistoryPage | null;
}

export const courseRead = defineRead<CourseView>()({
    key: (orgId, { courseId }) =>
        domainKey("courses", orgId, "course", courseId),
    route: { path: "/api/courses/[courseId]", params: { courseId: ID } },
    tier: "records",
});

export type CourseAsk = Parameters<typeof courseRead.options>[1];

/** A person's Courses tab: their seats, and the courses they could take. */
export interface ContactCoursesView {
    /** Null when they couldn't be read. */
    enrollments: Enrollment[] | null;
    /** Open courses; null when this person may not enrol, or they failed. */
    open: Course[] | null;
    /** The business's GST standing, for the enrol sheet's amount to pay. */
    gst: GstAsk | null;
}

export const contactCoursesRead = defineRead<ContactCoursesView>()({
    key: (orgId, { contactId }) =>
        domainKey("courses", orgId, "contact", contactId),
    route: {
        path: "/api/courses/contact/[contactId]",
        params: { contactId: ID },
    },
    tier: "records",
});

export type ContactCoursesAsk = Parameters<
    typeof contactCoursesRead.options
>[1];
