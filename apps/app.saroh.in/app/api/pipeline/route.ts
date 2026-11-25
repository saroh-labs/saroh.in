import { mayReadLeads, pipelineServer } from "@/lib/leads/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The Pipeline board (DEC-259), behind the section's gate. */
export const dynamic = "force-dynamic";
export const GET = readRoute(pipelineServer, mayReadLeads);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
