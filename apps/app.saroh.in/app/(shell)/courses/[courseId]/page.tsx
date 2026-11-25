import { notFound } from "next/navigation";

import { CourseDetailContainer } from "@/components/courses/course-detail-container";
import { canWriteCourses } from "@/lib/courses/access";
import { readCourseOnce } from "@/lib/courses/access-server";
import { readGstAsk } from "@/lib/gst-rates/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

/** The course's own name in the tab; "Course" when it can't be read. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    const { courseId } = await params;
    return recordTitle(
        () => readCourseOnce(courseId),
        (course) => course.name,
        "Course",
    );
}

/**
 * One course: its sessions, its roster, and enrolling someone. On React
 * Query (DEC-259): missing, or another business's, is this page's 404 from
 * the read the tab's title shares (`readCourseOnce`); who may change it
 * and what the enrol sheet offers (the people, the GST standing) are the
 * page's; the course with its price history (`/api/courses/[courseId]`) is
 * `CourseDetailContainer`'s query, read from the browser behind the
 * route's loader and again after every save.
 */
export default async function CourseDetailPage({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    await requireSession();
    const { courseId } = await params;
    const [course, organization] = await Promise.all([
        readCourseOnce(courseId),
        resolveActiveOrganization(),
    ]);
    if (!course) notFound();
    const canWrite = canWriteCourses(organization);
    const [contacts, gst] = await Promise.all([
        canWrite ? contactPickerOptions() : Promise.resolve([]),
        // For the enrol dialog's amount to pay; unread says the price typed.
        canWrite ? readGstAsk() : Promise.resolve(null),
    ]);

    return (
        <CourseDetailContainer
            ask={{ courseId }}
            skeleton={<Loading />}
            contacts={contacts}
            canWrite={canWrite}
            gst={gst}
        />
    );
}
