import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadOrganization, organizationServer } from "@/lib/settings/access";

/** Settings › Business, to owners and admins (org:settings:read) (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(organizationServer, mayReadOrganization);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
