import { CoursesScreen } from "@/components/courses/courses-screen";
import { PageContainer } from "@/components/shared/page/page-container";
import { canWriteCourses } from "@/lib/courses/access";
import { listCourses } from "@/lib/courses/service";
import { readMissingRates } from "@/lib/gst-rates/service";
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
    const [courses, organization, { view }, rates] = await Promise.all([
        listCourses(),
        resolveActiveOrganization(),
        searchParams,
        // What is on sale with no GST rate; null draws no notice.
        readMissingRates(),
    ]);
    return (
        <PageContainer width="full">
            <CoursesScreen
                courses={courses}
                canWrite={canWriteCourses(organization)}
                initialFilterId={view}
                missingRates={rates}
            />
        </PageContainer>
    );
}
