import { mayReadUsage, usageServer } from "@/lib/api-keys/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** API and AI apps › Usage: this minute's calls and the caps (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(usageServer, mayReadUsage);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
