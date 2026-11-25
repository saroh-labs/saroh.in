import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { shellLiveServer } from "@/lib/shell/access";

/**
 * The bell and the rail's badges: read on the live refresh (owner, 25 Nov).
 * One API call: its own guards refuse a non-member, so no gate beside it.
 */
export const dynamic = "force-dynamic";
export const GET = readRoute(shellLiveServer);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
