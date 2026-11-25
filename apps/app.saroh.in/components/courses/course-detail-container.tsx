"use client";

import type { ComponentProps, ReactNode } from "react";

import { PageContainer } from "@/components/shared/page/page-container";
import type { CourseAsk } from "@/lib/courses/queries";
import { useCourse } from "@/lib/courses/use-courses";

import { CoursePage } from "./course-page";

type Page = ComponentProps<typeof CoursePage>;

/**
 * A course's page on React Query (DEC-259): its title, actions, sessions
 * and roster all come from the course, so the route's loader (`skeleton`)
 * stands until its one read lands; every save reads it again
 * (`useCourseSave`). A failed read is the page failing (`error.tsx`).
 */
export function CourseDetailContainer({
    ask,
    skeleton,
    ...page
}: Omit<Page, "course" | "priceHistory" | "now"> & {
    ask: CourseAsk;
    skeleton: ReactNode;
}) {
    const read = useCourse(ask);
    if (read.isError && !read.data) throw read.error;
    if (!read.data) return skeleton;
    return (
        <PageContainer width="full">
            <CoursePage
                {...page}
                course={read.data.course}
                priceHistory={read.data.priceHistory}
                // When it was read, so "done" and "booked" agree with it.
                now={new Date(read.dataUpdatedAt).toISOString()}
            />
        </PageContainer>
    );
}
