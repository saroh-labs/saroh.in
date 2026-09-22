import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import type { CourseServiceOption } from "@/components/courses/course-form";
import { CourseForm } from "@/components/courses/course-form";
import { PageContainer } from "@/components/shared/page-container";
import { listCourses } from "@/lib/courses/service";
import { listServices } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New course" };

/** Courses → New: a run of sessions on one service. */
export default async function NewCoursePage() {
    await requireSession();
    const [services, courses] = await Promise.all([
        listServices(),
        listCourses(),
    ]);
    const options: CourseServiceOption[] = services
        .filter((s) => s.status === "ACTIVE")
        .map((s) => ({
            id: s.id,
            name: s.name,
            capacity: s.capacity,
            durationMinutes: s.durationMinutes,
            timezone: s.timezone,
            currency: s.currency,
        }));

    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        <Link
                            key="courses"
                            href="/courses"
                            className="hover:text-foreground"
                        >
                            Courses
                        </Link>,
                        "New",
                    ]}
                    title="New course"
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/courses">Back to courses</Link>
                        </Button>
                    }
                />
                {options.length === 0 ? (
                    <p className="max-w-[60ch] text-[13.5px] text-muted-foreground">
                        A course runs on a bookable service, and there is none
                        yet.{" "}
                        <Link
                            href="/services/new"
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Make a service
                        </Link>{" "}
                        first — its length and how many it takes at once set the
                        course's sessions and seats.
                    </p>
                ) : (
                    <CourseForm
                        services={options}
                        // The currency the business last priced a course in.
                        defaultCurrency={courses.at(0)?.currency ?? "INR"}
                    />
                )}
            </div>
        </PageContainer>
    );
}
