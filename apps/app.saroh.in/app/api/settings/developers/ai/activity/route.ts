import { aiActivityServer, mayReadAiApps } from "@/lib/ai-connections/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** AI assistants › one connection's changes here, as its sheet draws them (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(aiActivityServer, mayReadAiApps);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
