import { keysServer, mayReadKeys } from "@/lib/api-keys/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** API and AI apps › Connections: keys masked to their start, to apikey:manage (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(keysServer, mayReadKeys);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
