import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadSocial, ownPostsServer } from "@/lib/social/access";

/** The free Share's Your posts (DEC-259), to whoever may open Social. */
export const dynamic = "force-dynamic";
export const GET = readRoute(ownPostsServer, mayReadSocial);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
