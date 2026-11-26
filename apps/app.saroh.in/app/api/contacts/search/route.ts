import { contactSearchServer } from "@/lib/contacts/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The contact pickers' search (DEC-259); the API asks `contact:read`. */
export const dynamic = "force-dynamic";
export const GET = readRoute(contactSearchServer);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
