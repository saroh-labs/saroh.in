import { notificationsServer } from "@/lib/notifications/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The inbox (DEC-259): the API decides whose rows each person reads. */
export const dynamic = "force-dynamic";
export const GET = readRoute(notificationsServer);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
