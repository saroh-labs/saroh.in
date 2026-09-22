import { notFound } from "next/navigation";

import { CoursePage } from "@/components/courses/course-page";
import { PageContainer } from "@/components/shared/page-container";
import { canWriteCourses } from "@/lib/courses/access";
import { getCourse } from "@/lib/courses/service";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Course" };

/** One course: its sessions, its roster, and enrolling someone. */
export default async function CourseDetailPage({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    await requireSession();
    const { courseId } = await params;
    const [course, organization] = await Promise.all([
        getCourse(courseId),
        resolveActiveOrganization(),
    ]);
    if (!course) notFound();
    const canWrite = canWriteCourses(organization);
    const contacts = canWrite ? await contactPickerOptions() : [];

    return (
        <PageContainer width="full">
            <CoursePage
                course={course}
                contacts={contacts}
                canWrite={canWrite}
                now={new Date().toISOString()}
            />
        </PageContainer>
    );
}
