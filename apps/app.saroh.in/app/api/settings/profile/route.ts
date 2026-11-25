import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadProfile, profileServer } from "@/lib/settings/access";

/** Settings › Your profile, to everyone in the business (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(profileServer, mayReadProfile);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
