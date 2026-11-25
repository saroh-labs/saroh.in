import { mayReadProducts } from "@/lib/products/access";
import { productSettingsServer } from "@/lib/products/settings-access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Product settings (DEC-259), to whoever may open Products while Sell is on. */
export const dynamic = "force-dynamic";
export const GET = readRoute(productSettingsServer, mayReadProducts);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
