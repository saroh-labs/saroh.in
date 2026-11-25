import { CoursesContainer } from "@/components/courses/courses-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { canWriteCourses } from "@/lib/courses/access";
import { readMissingRates } from "@/lib/gst-rates/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Courses" };

/**
 * Courses: every course, on its tab (Open, Full, Closed, Draft, Past). On
 * React Query (DEC-259): the gates (who may add, the GST rates missing)
 * are the page's; the list (`/api/courses`) is `CoursesContainer`'s query,
 * read from the browser.
 */
export default async function CoursesPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    await requireSession();
    const [organization, { view }, rates] = await Promise.all([
        resolveActiveOrganization(),
        searchParams,
        // What is on sale with no GST rate; null draws no notice.
        readMissingRates(),
    ]);
    return (
        <PageContainer width="full">
            <CoursesContainer
                canWrite={canWriteCourses(organization)}
                initialFilterId={view}
                missingRates={rates}
            />
        </PageContainer>
    );
}
