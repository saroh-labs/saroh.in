import { aiAppsServer, mayReadAiApps } from "@/lib/ai-connections/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** API and AI apps › AI assistants: the connections, never a token (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(aiAppsServer, mayReadAiApps);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
