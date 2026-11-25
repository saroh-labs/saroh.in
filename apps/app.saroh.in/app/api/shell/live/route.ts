import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { shellAccess, shellLiveServer } from "@/lib/shell/access";

/** The bell and the rail's badges: read on the live refresh (owner, 25 Nov). */
export const dynamic = "force-dynamic";
export const GET = readRoute(shellLiveServer, shellAccess);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
