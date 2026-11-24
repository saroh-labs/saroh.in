import { calendarServer, mayReadCalendar } from "@/lib/calendar/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The Business Calendar's month or week (DEC-259); the API shapes it by permission. */
export const dynamic = "force-dynamic";
export const GET = readRoute(calendarServer, mayReadCalendar);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
