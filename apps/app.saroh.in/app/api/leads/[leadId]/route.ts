import { leadServer, mayReadLeads } from "@/lib/leads/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One lead's page (DEC-259); another business's lead is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(leadServer, mayReadLeads);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
