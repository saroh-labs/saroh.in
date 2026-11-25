import { coursesListServer, mayReadCourses } from "@/lib/courses/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Every course (DEC-259), behind the Courses gate. */
export const dynamic = "force-dynamic";
export const GET = readRoute(coursesListServer, mayReadCourses);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
