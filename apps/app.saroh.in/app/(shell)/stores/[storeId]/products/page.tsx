import { redirect } from "next/navigation";

/**
 * Retired in favour of Sell (#376). The list there spans every storefront;
 * this address still works.
 */
export default function Retired() {
    redirect("/commerce/products");
}
