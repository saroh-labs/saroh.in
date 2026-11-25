import { courseServer, mayReadCourses } from "@/lib/courses/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One course (DEC-259); another business's course is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(courseServer, mayReadCourses);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
