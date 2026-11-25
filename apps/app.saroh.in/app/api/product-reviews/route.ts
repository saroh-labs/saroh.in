import {
    mayReadReviews,
    productReviewsServer,
} from "@/lib/product-reviews/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Every review with the ratings (DEC-259), to whoever may read reviews while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(productReviewsServer, mayReadReviews);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
