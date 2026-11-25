import { mayReadShare, shareServer } from "@/lib/qr/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Settings › Share: the site's QR codes and the maker's choices, to whoever may read the website (site:read) (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(shareServer, mayReadShare);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
