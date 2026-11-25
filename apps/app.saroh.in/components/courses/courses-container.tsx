"use client";

import type { ComponentProps } from "react";

import { useCourses } from "@/lib/courses/use-courses";

import { CoursesScreen } from "./courses-screen";

/**
 * Courses on React Query (DEC-259): the header, New course, the tabs and
 * search are drawn at once from the page's gate; the rows are a skeleton
 * until the list's one read lands. A failed read is the page failing
 * (`error.tsx`).
 */
export function CoursesContainer(
    props: Omit<ComponentProps<typeof CoursesScreen>, "courses">,
) {
    const read = useCourses();
    if (read.isError && !read.data) throw read.error;
    return <CoursesScreen {...props} courses={read.data ?? null} />;
}
