import { redirect } from "next/navigation";

/**
 * Sell has no page of its own: its screens are the children in the rail.
 * `/commerce` was the storefront list before Storefronts had a screen, so old
 * links and the Sell row itself land there.
 */
export default function CommercePage() {
    redirect("/commerce/storefronts");
}
