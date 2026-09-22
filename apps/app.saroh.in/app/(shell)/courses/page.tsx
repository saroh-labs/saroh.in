import { CoursesScreen } from "@/components/courses/courses-screen";
import { PageContainer } from "@/components/shared/page-container";
import { canWriteCourses } from "@/lib/courses/access";
import { listCourses } from "@/lib/courses/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Courses" };

/** Courses: every course, on its tab (Open, Full, Closed, Draft, Past). */
export default async function CoursesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    await requireSession();
    const [courses, organization, { view }] = await Promise.all([
        listCourses(),
        resolveActiveOrganization(),
        searchParams,
    ]);
    return (
        <PageContainer width="full">
            <CoursesScreen
                courses={courses}
                canWrite={canWriteCourses(organization)}
                initialFilterId={view}
            />
        </PageContainer>
    );
}
