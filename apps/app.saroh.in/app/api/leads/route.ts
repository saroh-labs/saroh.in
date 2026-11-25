import { leadsListServer, mayReadLeads } from "@/lib/leads/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The leads, their open follow-ups and Add a lead (DEC-259), behind the section's gate. */
export const dynamic = "force-dynamic";
export const GET = readRoute(leadsListServer, mayReadLeads);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
