import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    activityServer,
    mayReadActivity,
} from "@/lib/settings/activity-access";

/** Settings › Activity: the last changes, worded, to audit:read (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(activityServer, mayReadActivity);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
