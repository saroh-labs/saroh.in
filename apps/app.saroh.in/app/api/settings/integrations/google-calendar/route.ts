import {
    googleCalendarServer,
    mayReadGoogleCalendar,
} from "@/lib/google-calendar/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Settings › Integrations › Google Calendar: the person's own accounts, never a token (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(googleCalendarServer, mayReadGoogleCalendar);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
