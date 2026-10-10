import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseForm } from "@/components/courses/course-form";
import { PageContainer } from "@/components/shared/page-container";
import { requireCan } from "@/lib/access/require-can";
import { getCourse } from "@/lib/courses/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Edit course" };

/** Change a course's name, price and seats. Sessions change on its page. */
export default async function EditCoursePage({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    await requireSession();
    const { courseId } = await params;
    // Asked before the form is drawn: `course:write` is what the API asks of
    // the save (`requireCan`).
    const access = await requireCan("course:write", {
        thing: "Edit course",
        back: {
            href: `/courses/${courseId}`,
            label: "Back to the course",
            needs: "course:read",
        },
    });
    if (access.denied) return access.denied;
    const course = await getCourse(courseId);
    if (!course) notFound();

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
                        <Link
                            key="course"
                            href={`/courses/${course.id}`}
                            className="hover:text-foreground"
                        >
                            {course.name}
                        </Link>,
                        "Edit",
                    ]}
                    title="Edit course"
                    actions={
                        <Button variant="outline" asChild>
                            <Link href={`/courses/${course.id}`}>
                                Back to the course
                            </Link>
                        </Button>
                    }
                />
                <CourseForm
                    // Fixed once made; shown so the form says what it runs on.
                    services={[
                        { ...course.service, currency: course.currency },
                    ]}
                    course={course}
                    defaultCurrency={course.currency}
                />
            </div>
        </PageContainer>
    );
}
