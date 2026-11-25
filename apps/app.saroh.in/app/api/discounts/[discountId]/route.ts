import { discountServer, mayReadDiscounts } from "@/lib/discounts/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One code's page (DEC-259); another business's code is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(discountServer, mayReadDiscounts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
