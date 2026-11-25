import {
    contactCoursesServer,
    mayReadCourses,
} from "@/lib/courses/access-server";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** A person's Courses tab (DEC-259): their seats and what they could take. */
export const dynamic = "force-dynamic";
export const GET = readRoute(contactCoursesServer, mayReadCourses);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
