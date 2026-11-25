import "server-only";

import { cache } from "react";

import { loadContactHoldings } from "@/lib/contacts/holdings";
import { moduleAccess } from "@/lib/modules/guard";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { readPriceHistory } from "@/lib/price-history/service";
import type { ServerRead } from "@/lib/query/route";

import { canWriteCourses } from "./access";
import type {
    ContactCoursesAsk,
    ContactCoursesView,
    CourseAsk,
    CourseView,
} from "./queries";
import { contactCoursesRead, courseRead, coursesListRead } from "./queries";
import type { Course, CourseDetail } from "./service";
import { getCourse, listCourses } from "./service";

/**
 * Who reads Courses (DEC-259), asked by `/api/courses/*`: what the pages
 * ask. `course:read` (the built-in Owner and Admin without resolved
 * permissions, as `canWriteCourses` does) while Courses is on, as the
 * section's `ModuleGate` decides; anyone else a 403. The API checks the
 * role and the plan on every read.
 */
export async function mayReadCourses(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    const may = organization?.actions
        ? organization.actions.includes("course:read")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    if (!may) return false;
    const access = await moduleAccess("COURSES");
    return access.state === "available" || access.state === "unknown";
}

/** One read of a course per render: the tab's title and the page share it. */
export const readCourseOnce = cache(
    (courseId: string): Promise<CourseDetail | null> => getCourse(courseId),
);

export const coursesListServer: ServerRead<Record<string, never>, Course[]> = {
    read: coursesListRead,
    service: () => listCourses(),
};

/** The course and its price history; another business's course is a 404. */
export async function readCourseView({
    courseId,
}: CourseAsk): Promise<CourseView | null> {
    const [course, priceHistory] = await Promise.all([
        readCourseOnce(courseId),
        // Optional: a read that fails is said in its place.
        readPriceHistory("courses", courseId).catch(() => null),
    ]);
    return course ? { course, priceHistory } : null;
}

export const courseServer: ServerRead<CourseAsk, CourseView> = {
    read: courseRead,
    service: readCourseView,
};

/**
 * A person's Courses tab: their seats and, when this person may enrol,
 * the open courses and the GST standing the enrol sheet asks. Each part
 * that fails is null, said in its place.
 */
export async function readContactCourses({
    contactId,
}: ContactCoursesAsk): Promise<ContactCoursesView> {
    const canEnrol = canWriteCourses(await activeOrganizationOnce());
    const holdings = await loadContactHoldings(contactId, {
        panels: ["courses"],
        canAct: {
            subscriptions: false,
            packs: false,
            courses: canEnrol,
            invoices: false,
        },
        mentionInvoices: false,
        paymentsOn: false,
    });
    return {
        enrollments: holdings.courses ?? null,
        open: holdings.choices.courses,
        gst: holdings.choices.gst ?? null,
    };
}

export const contactCoursesServer: ServerRead<
    ContactCoursesAsk,
    ContactCoursesView
> = { read: contactCoursesRead, service: readContactCourses };
