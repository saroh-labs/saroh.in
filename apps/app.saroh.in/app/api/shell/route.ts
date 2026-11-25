import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { shellAccess, shellSettingsServer } from "@/lib/shell/access";

/** What the shell draws that changes only with a setting (owner, 25 Nov). */
export const dynamic = "force-dynamic";
export const GET = readRoute(shellSettingsServer, shellAccess);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
