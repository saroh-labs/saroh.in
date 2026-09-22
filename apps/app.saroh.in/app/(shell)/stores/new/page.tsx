import { redirect } from "next/navigation";

import { newStorefrontHref } from "@/lib/stores/links";

/** Retired in favour of Sell (#376); this address still works. */
export default function Retired() {
    redirect(newStorefrontHref);
}
