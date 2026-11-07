import { notFound } from "next/navigation";

import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { plansShown } from "@/lib/saroh-billing/plans-shown";

/**
 * Settings › Plan and billing exists only while plans are shown (DEC-136,
 * `plansShown`). Otherwise its address is the app's not-found, answered
 * here, above the section's own loading and error boundaries, so neither
 * names the page first. On an edition Saroh doesn't bill (Global) it
 * stays, and the page holds only the Free note (`freeNoteShown`); its
 * Change plan screen is still not-found.
 */
export default function PlanBillingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    if (!plansShown() && !freeNoteShown()) notFound();
    return children;
}
