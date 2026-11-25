import {
    mayInviteReviews,
    reviewInvitesServer,
} from "@/lib/product-reviews/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** What Invite reviews offers (DEC-259), to whoever may invite while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(reviewInvitesServer, mayInviteReviews);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
