import { discountsListServer, mayReadDiscounts } from "@/lib/discounts/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The business's discount codes (DEC-259), behind the section's Sell gate. */
export const dynamic = "force-dynamic";
export const GET = readRoute(discountsListServer, mayReadDiscounts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
