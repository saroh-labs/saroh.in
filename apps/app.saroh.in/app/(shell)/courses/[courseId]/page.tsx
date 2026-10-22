import { notFound } from "next/navigation";
import { cache } from "react";

import { CoursePage } from "@/components/courses/course-page";
import { PageContainer } from "@/components/shared/page/page-container";
import { canWriteCourses } from "@/lib/courses/access";
import { getCourse } from "@/lib/courses/service";
import { readGstAsk } from "@/lib/gst-rates/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { readPriceHistory } from "@/lib/price-history/service";
import { requireSession } from "@/lib/session";

// One read for the tab's title and the page.
const readCourse = cache((courseId: string) => getCourse(courseId));

/** The course's own name in the tab; "Course" when it can't be read. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    const { courseId } = await params;
    return recordTitle(
        () => readCourse(courseId),
        (course) => course.name,
        "Course",
    );
}

/** One course: its sessions, its roster, and enrolling someone. */
export default async function CourseDetailPage({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    await requireSession();
    const { courseId } = await params;
    const [course, organization] = await Promise.all([
        readCourse(courseId),
        resolveActiveOrganization(),
    ]);
    if (!course) notFound();
    const canWrite = canWriteCourses(organization);
    const [contacts, gst, priceHistory] = await Promise.all([
        canWrite ? contactPickerOptions() : Promise.resolve([]),
        // For the enrol dialog's amount to pay; unread says the price typed.
        canWrite ? readGstAsk() : Promise.resolve(null),
        // What it has cost (12 Oct 2026). Optional: a read that fails is
        // said in its place.
        readPriceHistory("courses", courseId).catch(() => null),
    ]);

    return (
        <PageContainer width="full">
            <CoursePage
                course={course}
                contacts={contacts}
                canWrite={canWrite}
                now={new Date().toISOString()}
                gst={gst}
                priceHistory={priceHistory}
            />
        </PageContainer>
    );
}
