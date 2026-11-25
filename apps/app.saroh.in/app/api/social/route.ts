import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import { mayReadSocial, socialScreenServer } from "@/lib/social/access";

/** Saroh Social's screen: access, channels (display facts only) and posts (DEC-259), to whoever may open Social. */
export const dynamic = "force-dynamic";
export const GET = readRoute(socialScreenServer, mayReadSocial);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
