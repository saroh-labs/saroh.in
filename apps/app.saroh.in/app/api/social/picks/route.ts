import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadSocial, socialPicksServer } from "@/lib/social/access";

/** The free Share's What's worth posting (DEC-259), to whoever may open Social. */
export const dynamic = "force-dynamic";
export const GET = readRoute(socialPicksServer, mayReadSocial);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
