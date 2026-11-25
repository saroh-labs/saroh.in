import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadSocial, socialPostServer } from "@/lib/social/access";

/** One Saroh Social post (DEC-259), to whoever may open Social; another business's is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(socialPostServer, mayReadSocial);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
